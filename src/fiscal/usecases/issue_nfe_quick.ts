import { getFiscalDbPool } from "../infra/pg";
import { withPgTx } from "../persistence/pg/tx";
import { FiscalEngine, NoopTaxRuleEngine } from "../engine";
import { FocusNFeClient, FocusNFePayloadBuilder, getFocusEnv } from "../providers/focus";
import { getNfeDefaults, pickNfeDefaultsByAmbiente } from "../config/nfe_defaults";
import {
  FiscalInvoiceRepositoryPg,
  FiscalOperationRepositoryPg,
  FiscalProfileRepositoryPg,
  FiscalSequenceRepositoryPg,
  ProductFiscalDataRepositoryPg,
} from "../persistence/pg";

export type IssueNfeQuickResult = {
  invoiceId: string;
  focusRef: string;
  serie: string;
  numero: number;
  focusStatus: string | null;
  sefazStatus: string | null;
  sefazMessage: string | null;
};

function buildFocusRef(args: { issuerCnpj: string; serie: string; numero: number }) {
  return `${args.issuerCnpj}_NFE_${args.serie}_${String(args.numero).padStart(9, "0")}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export async function issueNfeQuick(input: unknown): Promise<IssueNfeQuickResult> {
  const pool = getFiscalDbPool();
  const focus = new FocusNFeClient();
  const { ambiente } = getFocusEnv();
  const defaults = pickNfeDefaultsByAmbiente(getNfeDefaults(), ambiente);

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

    const enrichedDraft = { ...draft, numero };
    const { payload } = await engine.buildFocusPayload(enrichedDraft);
    return { invoiceId: invoice.id, focusRef, serie: draft.serie, numero, payload };
  });

  const res = await focus.emitirNfe({ ref: created.focusRef, payload: created.payload });
  const body = res.body as unknown;

  const focusStatus = isRecord(body) ? (body.status as string | undefined) ?? null : null;
  const sefazStatus = isRecord(body) ? (body.status_sefaz as string | undefined) ?? null : null;
  const sefazMessage = isRecord(body) ? (body.mensagem_sefaz as string | undefined) ?? null : null;

  await withPgTx(pool, async (client) => {
    await invoiceRepo.applyFocusResult({
      client,
      invoiceId: created.invoiceId,
      focusStatus,
      sefazStatus,
      sefazMessage,
      chaveAcesso: isRecord(body) ? (body.chave_nfe as string | undefined) ?? null : null,
    });
  });

  return {
    invoiceId: created.invoiceId,
    focusRef: created.focusRef,
    serie: created.serie,
    numero: created.numero,
    focusStatus,
    sefazStatus,
    sefazMessage,
  };
}

export async function issueNfeHomologacaoQuick(input: unknown): Promise<IssueNfeQuickResult> {
  return issueNfeQuick(input);
}
