import type { FiscalDbClient } from "../../infra/pg";
import type { InvoiceInternalStatus } from "../../domain/enums";
import { randomUUID } from "node:crypto";

export type FiscalInvoiceRow = {
  id: string;
  source_order_id: number | null;
  issuer_cnpj: string;
  customer_id: string;
  model: number;
  serie: string;
  numero: number | null;
  internal_status: string;
  focus_ref: string | null;
  focus_status: string | null;
  sefaz_status: string | null;
  sefaz_message: string | null;
  chave_acesso: string | null;
  protocolo_autorizacao: string | null;
  xml_authorized: string | null;
  danfe_pdf_path: string | null;
  created_at: string;
  updated_at: string;
};

export class FiscalInvoiceRepositoryPg {
  private static schemaReady = false;

  private normalizeChaveAcesso(v: string | null | undefined): string | null {
    if (!v) return null;
    const digits = String(v).replace(/[^\d]/g, "");
    if (!digits) return null;
    if (digits.length <= 44) return digits;
    // Focus may return the key with extra characters; keep the last 44 digits.
    return digits.slice(-44);
  }

  async ensureSchema(args: { client: FiscalDbClient }): Promise<void> {
    if (FiscalInvoiceRepositoryPg.schemaReady) return;

    await args.client.query(`
      ALTER TABLE fiscal_invoices
      ADD COLUMN IF NOT EXISTS source_order_id bigint
    `);
    await args.client.query(`
      CREATE INDEX IF NOT EXISTS fiscal_invoices_source_order_id_idx
      ON fiscal_invoices (source_order_id)
    `);

    FiscalInvoiceRepositoryPg.schemaReady = true;
  }

  async create(args: {
    client: FiscalDbClient;
    sourceOrderId?: number | null;
    issuerCnpj: string;
    customerId: string;
    model: number;
    serie: string;
    numero: number;
    internalStatus: InvoiceInternalStatus;
    focusRef: string;
  }): Promise<FiscalInvoiceRow> {
    await this.ensureSchema({ client: args.client });
    const res = await args.client.query(
      `
      INSERT INTO fiscal_invoices (id, source_order_id, issuer_cnpj, customer_id, model, serie, numero, internal_status, focus_ref)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `,
      [
        randomUUID(),
        args.sourceOrderId ?? null,
        args.issuerCnpj,
        args.customerId,
        args.model,
        args.serie,
        args.numero,
        args.internalStatus,
        args.focusRef,
      ]
    );
    return res.rows[0] as FiscalInvoiceRow;
  }

  async findActiveBySourceOrderId(args: {
    client: FiscalDbClient;
    sourceOrderId: number;
  }): Promise<FiscalInvoiceRow | null> {
    await this.ensureSchema({ client: args.client });
    const res = await args.client.query(
      `
      SELECT *
      FROM fiscal_invoices
      WHERE source_order_id = $1
        AND internal_status NOT IN ('CANCELED', 'DENIED')
      ORDER BY created_at DESC
      LIMIT 1
    `,
      [args.sourceOrderId]
    );
    return (res.rows[0] as FiscalInvoiceRow | undefined) ?? null;
  }

  async setInternalStatus(args: {
    client: FiscalDbClient;
    invoiceId: string;
    status: InvoiceInternalStatus;
  }): Promise<void> {
    await args.client.query(
      "UPDATE fiscal_invoices SET internal_status = $2, updated_at = now() WHERE id = $1",
      [args.invoiceId, args.status]
    );
  }

  async applyFocusResult(args: {
    client: FiscalDbClient;
    invoiceId: string;
    focusStatus?: string | null;
    sefazStatus?: string | null;
    sefazMessage?: string | null;
    chaveAcesso?: string | null;
    protocoloAutorizacao?: string | null;
    xmlAuthorized?: string | null;
  }): Promise<void> {
    const chave = this.normalizeChaveAcesso(args.chaveAcesso);
    await args.client.query(
      `
      UPDATE fiscal_invoices
      SET
        focus_status = COALESCE($2, focus_status),
        sefaz_status = COALESCE($3, sefaz_status),
        sefaz_message = COALESCE($4, sefaz_message),
        chave_acesso = COALESCE($5, chave_acesso),
        protocolo_autorizacao = COALESCE($6, protocolo_autorizacao),
        xml_authorized = COALESCE($7, xml_authorized),
        updated_at = now()
      WHERE id = $1
    `,
      [
        args.invoiceId,
        args.focusStatus ?? null,
        args.sefazStatus ?? null,
        args.sefazMessage ?? null,
        chave,
        args.protocoloAutorizacao ?? null,
        args.xmlAuthorized ?? null,
      ]
    );
  }

  async getById(args: { client: FiscalDbClient; invoiceId: string }): Promise<FiscalInvoiceRow | null> {
    await this.ensureSchema({ client: args.client });
    const res = await args.client.query("SELECT * FROM fiscal_invoices WHERE id = $1", [
      args.invoiceId,
    ]);
    return (res.rows[0] as FiscalInvoiceRow | undefined) ?? null;
  }

  async setDanfePdfPath(args: { client: FiscalDbClient; invoiceId: string; publicPath: string }): Promise<void> {
    await args.client.query(
      "UPDATE fiscal_invoices SET danfe_pdf_path=$2, updated_at=now() WHERE id=$1",
      [args.invoiceId, args.publicPath]
    );
  }
}
