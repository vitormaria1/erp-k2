import { getFiscalDbPool } from "../infra/pg";
import { withPgTx } from "../persistence/pg/tx";
import { FiscalEngine, NoopTaxRuleEngine } from "../engine";
import { FocusNFePayloadBuilder, getFocusEnv } from "../providers/focus";
import { getNfeDefaults, pickNfeDefaultsByAmbiente } from "../config/nfe_defaults";
import {
  FiscalInvoiceRepositoryPg,
  FiscalJobRepositoryPg,
  FiscalOperationRepositoryPg,
  FiscalProfileRepositoryPg,
  FiscalSequenceRepositoryPg,
  ProductFiscalDataRepositoryPg,
} from "../persistence/pg";

export type IssueNfeResult = {
  invoiceId: string;
  focusRef: string;
  serie: string;
  numero: number;
};

function buildFocusRef(args: { issuerCnpj: string; serie: string; numero: number }) {
  return `${args.issuerCnpj}_NFE_${args.serie}_${String(args.numero).padStart(9, "0")}`;
}

export async function issueNfe(
  input: unknown,
  opts: { sourceOrderId?: number | null } = {}
): Promise<IssueNfeResult> {
  const pool = getFiscalDbPool();
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
  const jobRepo = new FiscalJobRepositoryPg();
  // Validate Focus config at enqueue time so the user gets a deterministic error immediately.
  getFocusEnv();

  return withPgTx(pool, async (client) => {
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
      sourceOrderId: opts.sourceOrderId ?? null,
      issuerCnpj: draft.issuer.cnpj,
      customerId: draft.recipient.customerId,
      model: draft.model,
      serie: draft.serie,
      numero,
      internalStatus: "READY_TO_ISSUE",
      focusRef,
    });

    const enrichedDraft = { ...draft, numero };
    const { payload } = await engine.buildFocusPayload(enrichedDraft, { client });

    await jobRepo.enqueue({
      client,
      kind: "ISSUE_NFE",
      payload: { invoiceId: invoice.id, focusRef, payload, ambiente },
      invoiceId: invoice.id,
    });

    return { invoiceId: invoice.id, focusRef, serie: draft.serie, numero };
  });
}

export async function issueNfeHomologacao(input: unknown): Promise<IssueNfeResult> {
  return issueNfe(input);
}
