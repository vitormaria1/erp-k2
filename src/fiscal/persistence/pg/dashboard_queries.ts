import type { FiscalDbPool } from "../../infra/pg";

export type FiscalInvoiceListRow = {
  id: string;
  created_at: string;
  issuer_cnpj: string;
  customer_id: string;
  model: number;
  serie: string;
  numero: number | null;
  internal_status: string;
  focus_ref: string | null;
  focus_status: string | null;
  sefaz_status: string | null;
  chave_acesso: string | null;
};

export async function listFiscalInvoices(pool: FiscalDbPool, limit = 20): Promise<FiscalInvoiceListRow[]> {
  const res = await pool.query(
    `
    SELECT
      id, created_at, issuer_cnpj, customer_id, model, serie, numero,
      internal_status, focus_ref, focus_status, sefaz_status, chave_acesso
    FROM fiscal_invoices
    ORDER BY created_at DESC
    LIMIT $1
  `,
    [limit]
  );
  return res.rows as FiscalInvoiceListRow[];
}
