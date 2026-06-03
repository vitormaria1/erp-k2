import { setTimeout as sleep } from "node:timers/promises";

import { getNfeDefaults, pickNfeDefaultsByAmbiente } from "../config/nfe_defaults";
import { getFiscalDbPool } from "../infra/pg";
import { withPgTx } from "../persistence/pg/tx";
import { FiscalEngine, NoopTaxRuleEngine } from "../engine";
import { FocusNFeClient, FocusNFePayloadBuilder, getFocusEnv } from "../providers/focus";
import {
  FiscalInvoiceRepositoryPg,
  FiscalOperationRepositoryPg,
  FiscalProfileRepositoryPg,
  FiscalSequenceRepositoryPg,
  ProductFiscalDataRepositoryPg,
} from "../persistence/pg";

export type IssueNfeSyncResult = {
  invoiceId: string;
  focusRef: string;
  serie: string;
  numero: number;
  internalStatus: string;
  focusStatus: string | null;
  sefazStatus: string | null;
  sefazMessage: string | null;
  chaveAcesso: string | null;
};

function buildFocusRef(args: { issuerCnpj: string; serie: string; numero: number }) {
  return `${args.issuerCnpj}_NFE_${args.serie}_${String(args.numero).padStart(9, "0")}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export async function issueNfeSync(
  input: unknown,
  opts: { pollMs?: number; maxPolls?: number } = {}
): Promise<IssueNfeSyncResult> {
  const pollMs = opts.pollMs ?? 2000;
  const maxPolls = opts.maxPolls ?? 15;

  const pool = getFiscalDbPool();
  const { ambiente } = getFocusEnv();
  const defaults = pickNfeDefaultsByAmbiente(getNfeDefaults(), ambiente);
  const focus = new FocusNFeClient();

  const productFiscalDataRepo = new ProductFiscalDataRepositoryPg(pool);
  const fiscalProfileRepo = new FiscalProfileRepositoryPg(pool);
  const fiscalOperationRepo = new FiscalOperationRepositoryPg(pool);
  const payloadBuilder = new FocusNFePayloadBuilder({ productFiscalDataRepo });

  const engine = new FiscalEngine<Record<string, unknown>>({
    productFiscalDataRepo,
    fiscalProfileRepo,
    fiscalOperationRepo,
    taxRuleEngine: new NoopTaxRuleEngine(),
    payloadBuilder,
  });

  const draft = await engine.validateDraft(input);

  const sequenceRepo = new FiscalSequenceRepositoryPg();
  const invoiceRepo = new FiscalInvoiceRepositoryPg();

  const created = await withPgTx(pool, async (client) => {
    const numero = await sequenceRepo.reserveNextNumber({
      client,
      issuerCnpj: draft.issuer.cnpj,
      model: draft.model,
      serie: draft.serie,
      startAt: defaults.startNumber,
    });
    const focusRef = buildFocusRef({ issuerCnpj: draft.issuer.cnpj, serie: draft.serie, numero });

    const invoice = await invoiceRepo.create({
      client,
      issuerCnpj: draft.issuer.cnpj,
      customerId: draft.recipient.customerId,
      model: draft.model,
      serie: draft.serie,
      numero,
      internalStatus: "ISSUING",
      focusRef,
    });
    return { invoiceId: invoice.id, focusRef, serie: draft.serie, numero };
  });

  // Importante: não monta payload dentro da TX para evitar deadlock no modo PGlite (payload builder consulta o DB fiscal).
  const enrichedDraft = { ...draft, numero: created.numero };
  const { payload } = await engine.buildFocusPayload(enrichedDraft);

  const first = await focus.emitirNfe({ ref: created.focusRef, payload });
  const firstBody = first.body as unknown;

  await withPgTx(pool, async (client) => {
    await invoiceRepo.applyFocusResult({
      client,
      invoiceId: created.invoiceId,
      focusStatus: isRecord(firstBody) ? (firstBody.status as string | undefined) ?? null : null,
      sefazStatus: isRecord(firstBody) ? (firstBody.status_sefaz as string | undefined) ?? null : null,
      sefazMessage: isRecord(firstBody) ? (firstBody.mensagem_sefaz as string | undefined) ?? null : null,
      chaveAcesso: isRecord(firstBody) ? (firstBody.chave_nfe as string | undefined) ?? null : null,
    });
  });

  // Poll until final
  for (let i = 0; i < maxPolls; i++) {
    const consult = await focus.consultarNfe({ ref: created.focusRef, completa: 0 });
    const body = consult.body as unknown;
    const status = isRecord(body) ? (body.status as string | undefined) ?? null : null;

    if (status && status !== "processando_autorizacao") {
      let xml: string | null = null;
      const caminho = isRecord(body) && typeof body.caminho_xml_nota_fiscal === "string" ? body.caminho_xml_nota_fiscal : null;
      if (caminho) {
        const dl = await focus.baixarArquivo(caminho);
        if (dl.httpStatus >= 200 && dl.httpStatus < 300) xml = dl.body;
      }

      await withPgTx(pool, async (client) => {
        await invoiceRepo.applyFocusResult({
          client,
          invoiceId: created.invoiceId,
          focusStatus: status,
          sefazStatus: isRecord(body) ? (body.status_sefaz as string | undefined) ?? null : null,
          sefazMessage: isRecord(body) ? (body.mensagem_sefaz as string | undefined) ?? null : null,
          chaveAcesso: isRecord(body) ? (body.chave_nfe as string | undefined) ?? null : null,
          xmlAuthorized: xml,
        });
        await invoiceRepo.setInternalStatus({
          client,
          invoiceId: created.invoiceId,
          status:
            status === "autorizado"
              ? "AUTHORIZED"
              : status === "rejeitado"
                ? "REJECTED"
                : status === "denegado"
                  ? "DENIED"
                  : "ERROR",
        });
      });

      const row = await withPgTx(pool, async (client) => invoiceRepo.getById({ client, invoiceId: created.invoiceId }));
      if (!row) throw new Error("Invoice not found after issue");
      return {
        invoiceId: row.id,
        focusRef: row.focus_ref!,
        serie: row.serie,
        numero: row.numero ?? created.numero,
        internalStatus: row.internal_status,
        focusStatus: row.focus_status,
        sefazStatus: row.sefaz_status,
        sefazMessage: row.sefaz_message,
        chaveAcesso: row.chave_acesso,
      };
    }

    await sleep(pollMs);
  }

  const row = await withPgTx(pool, async (client) => invoiceRepo.getById({ client, invoiceId: created.invoiceId }));
  if (!row) throw new Error("Invoice not found after polling");
  return {
    invoiceId: row.id,
    focusRef: row.focus_ref!,
    serie: row.serie,
    numero: row.numero ?? created.numero,
    internalStatus: row.internal_status,
    focusStatus: row.focus_status,
    sefazStatus: row.sefaz_status,
    sefazMessage: row.sefaz_message,
    chaveAcesso: row.chave_acesso,
  };
}

export async function issueNfeHomologacaoSync(
  input: unknown,
  opts: { pollMs?: number; maxPolls?: number } = {}
): Promise<IssueNfeSyncResult> {
  return issueNfeSync(input, opts);
}
