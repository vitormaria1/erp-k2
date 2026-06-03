import { z } from "zod";

export type IssuerConfig = {
  cnpj: string;
  ie: string;
  razaoSocial: string;
  nomeFantasia?: string;
  endereco: {
    logradouro: string;
    numero: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
    codigoMunicipio?: string;
  };
};

const EnvSchema = z.object({
  FISCAL_ISSUER_CNPJ: z.string().trim().regex(/^\d{14}$/),
  FISCAL_ISSUER_IE: z.string().trim().min(2),
  FISCAL_ISSUER_RAZAO: z.string().trim().min(2),
  FISCAL_ISSUER_FANTASIA: z.string().trim().optional(),

  FISCAL_ISSUER_LOGRADOURO: z.string().trim().min(2),
  FISCAL_ISSUER_NUMERO: z.string().trim().min(1),
  FISCAL_ISSUER_BAIRRO: z.string().trim().min(1),
  FISCAL_ISSUER_MUNICIPIO: z.string().trim().min(1),
  FISCAL_ISSUER_UF: z.string().trim().length(2),
  FISCAL_ISSUER_CEP: z.string().trim().regex(/^\d{8}$/),
  FISCAL_ISSUER_COD_MUN: z.string().trim().regex(/^\d{7}$/).optional(),
});

const issuerEnvKeys = [
  "FISCAL_ISSUER_CNPJ",
  "FISCAL_ISSUER_IE",
  "FISCAL_ISSUER_RAZAO",
  "FISCAL_ISSUER_FANTASIA",
  "FISCAL_ISSUER_LOGRADOURO",
  "FISCAL_ISSUER_NUMERO",
  "FISCAL_ISSUER_BAIRRO",
  "FISCAL_ISSUER_MUNICIPIO",
  "FISCAL_ISSUER_UF",
  "FISCAL_ISSUER_CEP",
  "FISCAL_ISSUER_COD_MUN",
] as const;

function formatZodIssues(error: z.ZodError) {
  const invalidKeys = new Set<string>();
  const missingKeys = new Set<string>();

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string" || !issuerEnvKeys.includes(key as (typeof issuerEnvKeys)[number])) {
      continue;
    }
    if (issue.code === "invalid_type" && issue.received === "undefined") {
      missingKeys.add(key);
      continue;
    }
    invalidKeys.add(key);
  }

  const parts: string[] = [];
  if (missingKeys.size > 0) {
    parts.push(`faltam ${Array.from(missingKeys).join(", ")}`);
  }
  if (invalidKeys.size > 0) {
    parts.push(`estão inválidas: ${Array.from(invalidKeys).join(", ")}`);
  }

  return parts.length > 0 ? parts.join("; ") : "defina FISCAL_ISSUER_* no .env";
}

export function getIssuerConfig(): IssuerConfig {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Config do emitente inválida: ${formatZodIssues(parsed.error)}`);
  }

  return {
    cnpj: parsed.data.FISCAL_ISSUER_CNPJ,
    ie: parsed.data.FISCAL_ISSUER_IE,
    razaoSocial: parsed.data.FISCAL_ISSUER_RAZAO,
    nomeFantasia: parsed.data.FISCAL_ISSUER_FANTASIA,
    endereco: {
      logradouro: parsed.data.FISCAL_ISSUER_LOGRADOURO,
      numero: parsed.data.FISCAL_ISSUER_NUMERO,
      bairro: parsed.data.FISCAL_ISSUER_BAIRRO,
      municipio: parsed.data.FISCAL_ISSUER_MUNICIPIO,
      uf: parsed.data.FISCAL_ISSUER_UF,
      cep: parsed.data.FISCAL_ISSUER_CEP,
      codigoMunicipio: parsed.data.FISCAL_ISSUER_COD_MUN,
    },
  };
}
