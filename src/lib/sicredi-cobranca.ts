import { z } from "zod";

type SicrediEnv = "sandbox" | "production";

type AuthResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_expires_in?: number;
  scope?: string;
};

type TokenCache = {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string | null;
  refreshTokenExpiresAt: number | null;
};

type EmitirBoletoArgs = {
  receivableId: string;
  customer: {
    name: string;
    document: string;
    street: string;
    number?: string | null;
    complement?: string | null;
    neighborhood?: string | null;
    city: string;
    uf: string;
    cep: string;
    phone?: string | null;
    email?: string | null;
  };
  amount: number;
  dueDate: string;
  orderId?: number | null;
};

type BoletoIssueResult = {
  request: Record<string, unknown>;
  response: unknown;
  nossoNumero: string | null;
  linhaDigitavel: string | null;
};

type InstructionResponse = {
  request: Record<string, unknown> | null;
  response: unknown;
};

const EnvSchema = z.object({
  SICREDI_ENV: z.union([z.literal("sandbox"), z.literal("production")]).default("sandbox"),
  SICREDI_API_KEY: z.string().trim().min(10),
  SICREDI_USERNAME: z.string().trim().optional(),
  SICREDI_PASSWORD: z.string().trim().optional(),
  SICREDI_COOPERATIVA: z.string().trim().regex(/^\d{4}$/),
  SICREDI_POSTO: z.string().trim().regex(/^\d{2}$/),
  SICREDI_CODIGO_BENEFICIARIO: z.string().trim().regex(/^\d{5}$/),
  SICREDI_CONTEXT: z.string().trim().default("COBRANCA"),
  SICREDI_TIPO_COBRANCA: z.union([z.literal("NORMAL"), z.literal("HIBRIDO")]).default("NORMAL"),
  SICREDI_ESPECIE_DOCUMENTO: z.string().trim().default("DUPLICATA_MERCANTIL_INDICACAO"),
});

let tokenCache: TokenCache | null = null;

function isAuthResponse(value: unknown): value is AuthResponse {
  return Boolean(value) && typeof value === "object" && typeof (value as AuthResponse).access_token === "string";
}

function sanitizeDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D+/g, "");
}

function inferTipoPessoa(document: string) {
  if (document.length === 11) return "PESSOA_FISICA";
  if (document.length === 14) return "PESSOA_JURIDICA";
  throw new Error("CPF/CNPJ do pagador invalido para emissao de boleto.");
}

function compactAddress(args: {
  street: string;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
}) {
  return [args.street, args.number, args.complement, args.neighborhood].filter(Boolean).join(", ").slice(0, 40);
}

function buildSeuNumero(receivableId: string, orderId?: number | null) {
  if (typeof orderId === "number" && Number.isFinite(orderId)) {
    return `PED${String(orderId).padStart(7, "0")}`.slice(0, 10);
  }
  return sanitizeDigits(receivableId).slice(0, 10) || receivableId.replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
}

function isFuture(ts: number | null | undefined) {
  return typeof ts === "number" && ts > Date.now() + 30_000;
}

function getSicrediConfig() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      "Config Sicredi invalida: defina SICREDI_API_KEY, SICREDI_COOPERATIVA, SICREDI_POSTO e SICREDI_CODIGO_BENEFICIARIO."
    );
  }

  const env = parsed.data.SICREDI_ENV as SicrediEnv;
  const baseUrl = env === "sandbox" ? "https://api-parceiro.sicredi.com.br/sb" : "https://api-parceiro.sicredi.com.br";
  const username =
    parsed.data.SICREDI_USERNAME?.trim() ||
    (env === "sandbox"
      ? "123456789"
      : `${parsed.data.SICREDI_CODIGO_BENEFICIARIO}${parsed.data.SICREDI_COOPERATIVA}`);
  const password = parsed.data.SICREDI_PASSWORD?.trim() || (env === "sandbox" ? "teste123" : "");

  if (!password) {
    throw new Error("Config Sicredi invalida: defina SICREDI_PASSWORD com o codigo de acesso do Internet Banking.");
  }

  return {
    env,
    baseUrl,
    apiKey: parsed.data.SICREDI_API_KEY,
    username,
    password,
    cooperativa: parsed.data.SICREDI_COOPERATIVA,
    posto: parsed.data.SICREDI_POSTO,
    codigoBeneficiario: parsed.data.SICREDI_CODIGO_BENEFICIARIO,
    context: parsed.data.SICREDI_CONTEXT,
    tipoCobranca: parsed.data.SICREDI_TIPO_COBRANCA,
    especieDocumento: parsed.data.SICREDI_ESPECIE_DOCUMENTO,
  };
}

function assertCustomerReady(customer: EmitirBoletoArgs["customer"]) {
  const missing: string[] = [];
  if (!customer.name?.trim()) missing.push("nome");
  if (!sanitizeDigits(customer.document)) missing.push("cpf/cnpj");
  if (!customer.street?.trim()) missing.push("logradouro");
  if (!customer.city?.trim()) missing.push("cidade");
  if (!customer.uf?.trim()) missing.push("UF");
  if (!sanitizeDigits(customer.cep)) missing.push("CEP");
  if (missing.length) {
    throw new Error(`Cliente sem dados suficientes para boleto: ${missing.join(", ")}.`);
  }
}

function findString(value: unknown, acceptedKeys: string[]): string | null {
  if (!value || typeof value !== "object") return null;

  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }

    for (const [key, entry] of Object.entries(current)) {
      if (acceptedKeys.includes(key) && typeof entry === "string" && entry.trim()) {
        return entry.trim();
      }
      if (entry && typeof entry === "object") stack.push(entry);
    }
  }

  return null;
}

export function extractLinhaDigitavel(payload: unknown) {
  return findString(payload, ["linhaDigitavel", "linha_digitavel", "codigoLinhaDigitavel"]);
}

export function extractNossoNumero(payload: unknown) {
  return findString(payload, ["nossoNumero", "nosso_numero"]);
}

export function buildBoletoPayloadUpdate(
  payload: unknown,
  values: { nossoNumero?: string | null; linhaDigitavel?: string | null }
): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

  const next = { ...(payload as Record<string, unknown>) };
  if (values.nossoNumero?.trim()) next.nossoNumero = values.nossoNumero.trim();
  if (values.linhaDigitavel?.trim()) next.linhaDigitavel = values.linhaDigitavel.trim();
  return next;
}

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function formatErrorDetail(responseBody: unknown) {
  if (responseBody && typeof responseBody === "object" && "raw" in responseBody && typeof responseBody.raw === "string") {
    return responseBody.raw;
  }
  return JSON.stringify(responseBody);
}

export class SicrediApiError extends Error {
  readonly status: number;
  readonly responseBody: unknown;

  constructor(message: string, status: number, responseBody: unknown) {
    super(message);
    this.name = "SicrediApiError";
    this.status = status;
    this.responseBody = responseBody;
  }

  includesText(text: string) {
    return JSON.stringify(this.responseBody).toLowerCase().includes(text.toLowerCase());
  }
}

export class SicrediCobrancaClient {
  private readonly config = getSicrediConfig();

  private getAuthHeaders() {
    return {
      "content-type": "application/x-www-form-urlencoded",
      "x-api-key": this.config.apiKey,
      context: this.config.context,
    };
  }

  private async authenticateWithPassword() {
    const body = new URLSearchParams({
      username: this.config.username,
      password: this.config.password,
      scope: "cobranca",
      grant_type: "password",
    });

    const res = await fetch(`${this.config.baseUrl}/auth/openapi/token`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body,
      cache: "no-store",
    });

    const parsed = await parseJsonSafe(res);
    if (!res.ok || !isAuthResponse(parsed)) {
      throw new Error(`Falha na autenticacao Sicredi (HTTP ${res.status}): ${formatErrorDetail(parsed)}`);
    }

    tokenCache = {
      accessToken: parsed.access_token,
      accessTokenExpiresAt: Date.now() + Number(parsed.expires_in ?? 0) * 1000,
      refreshToken: parsed.refresh_token ?? null,
      refreshTokenExpiresAt:
        typeof parsed.refresh_expires_in === "number" ? Date.now() + parsed.refresh_expires_in * 1000 : null,
    };

    return tokenCache.accessToken;
  }

  private async authenticateWithRefresh(refreshToken: string) {
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

    const res = await fetch(`${this.config.baseUrl}/auth/openapi/token`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body,
      cache: "no-store",
    });

    const parsed = await parseJsonSafe(res);
    if (!res.ok || !isAuthResponse(parsed)) {
      tokenCache = null;
      return this.authenticateWithPassword();
    }

    tokenCache = {
      accessToken: parsed.access_token,
      accessTokenExpiresAt: Date.now() + Number(parsed.expires_in ?? 0) * 1000,
      refreshToken: parsed.refresh_token ?? refreshToken,
      refreshTokenExpiresAt:
        typeof parsed.refresh_expires_in === "number" ? Date.now() + parsed.refresh_expires_in * 1000 : null,
    };

    return tokenCache.accessToken;
  }

  private async authenticate() {
    if (tokenCache && isFuture(tokenCache.accessTokenExpiresAt)) {
      return tokenCache.accessToken;
    }

    if (tokenCache?.refreshToken && isFuture(tokenCache.refreshTokenExpiresAt)) {
      return this.authenticateWithRefresh(tokenCache.refreshToken);
    }

    return this.authenticateWithPassword();
  }

  async emitirBoleto(args: EmitirBoletoArgs): Promise<BoletoIssueResult> {
    assertCustomerReady(args.customer);

    const token = await this.authenticate();
    const document = sanitizeDigits(args.customer.document);
    const requestBody = {
      codigoBeneficiario: this.config.codigoBeneficiario,
      dataVencimento: args.dueDate,
      especieDocumento: this.config.especieDocumento,
      idTituloEmpresa: args.receivableId.slice(0, 25),
      pagador: {
        nome: args.customer.name.trim().slice(0, 200),
        documento: document,
        tipoPessoa: inferTipoPessoa(document),
        cep: sanitizeDigits(args.customer.cep),
        cidade: args.customer.city.trim().toUpperCase().slice(0, 40),
        endereco: compactAddress(args.customer),
        uf: args.customer.uf.trim().toUpperCase().slice(0, 2),
        telefone: sanitizeDigits(args.customer.phone).slice(0, 11) || undefined,
        email: args.customer.email?.trim().slice(0, 40) || undefined,
      },
      tipoCobranca: this.config.tipoCobranca,
      seuNumero: buildSeuNumero(args.receivableId, args.orderId),
      valor: Number(args.amount.toFixed(2)),
      informativo: args.orderId ? [`Pedido ${args.orderId}`] : undefined,
      mensagem: [`Recebivel ${args.receivableId}`],
    };

    const res = await fetch(`${this.config.baseUrl}/cobranca/boleto/v1/boletos`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        cooperativa: this.config.cooperativa,
        posto: this.config.posto,
        accept: "application/json",
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    });

    const responseBody = await parseJsonSafe(res);
    if (!res.ok) {
      throw new SicrediApiError(
        `Falha ao emitir boleto no Sicredi (HTTP ${res.status}): ${formatErrorDetail(responseBody)}`,
        res.status,
        responseBody
      );
    }

    let nossoNumero = extractNossoNumero(responseBody);
    let linhaDigitavel = extractLinhaDigitavel(responseBody);

    if (!linhaDigitavel && nossoNumero) {
      const consult = await this.consultarBoleto({ token, nossoNumero });
      linhaDigitavel = extractLinhaDigitavel(consult) ?? linhaDigitavel;
      nossoNumero = extractNossoNumero(consult) ?? nossoNumero;
      return { request: requestBody, response: { issue: responseBody, consult }, nossoNumero, linhaDigitavel };
    }

    return { request: requestBody, response: responseBody, nossoNumero, linhaDigitavel };
  }

  async consultarBoleto(args: { nossoNumero: string; token?: string }) {
    const token = args.token ?? (await this.authenticate());
    const url = new URL(`${this.config.baseUrl}/cobranca/boleto/v1/boletos`);
    url.searchParams.set("codigoBeneficiario", this.config.codigoBeneficiario);
    url.searchParams.set("nossoNumero", args.nossoNumero);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-api-key": this.config.apiKey,
        cooperativa: this.config.cooperativa,
        posto: this.config.posto,
        accept: "application/json",
      },
      cache: "no-store",
    });

    const body = await parseJsonSafe(res);
    if (!res.ok) {
      throw new SicrediApiError(`Falha ao consultar boleto no Sicredi (HTTP ${res.status}): ${formatErrorDetail(body)}`, res.status, body);
    }

    return body;
  }

  private async sendInstruction(args: { path: string; body?: Record<string, unknown> | null }): Promise<InstructionResponse> {
    const token = await this.authenticate();
    const requestBody = args.body ?? null;

    const res = await fetch(`${this.config.baseUrl}${args.path}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        codigoBeneficiario: this.config.codigoBeneficiario,
        cooperativa: this.config.cooperativa,
        posto: this.config.posto,
        accept: "application/json",
      },
      body: requestBody ? JSON.stringify(requestBody) : JSON.stringify({}),
      cache: "no-store",
    });

    const responseBody = await parseJsonSafe(res);
    if (res.status !== 202) {
      throw new SicrediApiError(
        `Falha ao enviar instrucao ao Sicredi (HTTP ${res.status}): ${formatErrorDetail(responseBody)}`,
        res.status,
        responseBody
      );
    }

    return { request: requestBody, response: responseBody };
  }

  async baixarBoleto(nossoNumero: string) {
    return this.sendInstruction({
      path: `/cobranca/boleto/v1/boletos/${encodeURIComponent(nossoNumero)}/baixa`,
    });
  }

  async alterarDataVencimento(nossoNumero: string, dataVencimento: string) {
    return this.sendInstruction({
      path: `/cobranca/boleto/v1/boletos/${encodeURIComponent(nossoNumero)}/data-vencimento`,
      body: { dataVencimento },
    });
  }

  async baixarPdfPorLinhaDigitavel(linhaDigitavel: string) {
    const token = await this.authenticate();
    const url = new URL(`${this.config.baseUrl}/cobranca/boleto/v1/boletos/pdf`);
    url.searchParams.set("linhaDigitavel", linhaDigitavel);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-api-key": this.config.apiKey,
        codigoBeneficiario: this.config.codigoBeneficiario,
        cooperativa: this.config.cooperativa,
        posto: this.config.posto,
        accept: "application/pdf",
      },
      cache: "no-store",
    });

    const body = Buffer.from(await res.arrayBuffer());
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Falha ao baixar PDF do boleto no Sicredi (HTTP ${res.status}).`);
    }

    return body;
  }
}
