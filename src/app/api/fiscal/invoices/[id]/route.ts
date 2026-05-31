import { getFiscalDbPool } from "@/fiscal/infra/pg";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pool = getFiscalDbPool();
  const res = await pool.query(
    `
    SELECT
      id,
      created_at,
      issuer_cnpj,
      customer_id,
      model,
      serie,
      numero,
      internal_status,
      focus_ref,
      focus_status,
      sefaz_status,
      sefaz_message,
      chave_acesso
    FROM fiscal_invoices
    WHERE id = $1
  `,
    [id]
  );
  if (!res.rowCount) return new Response("Not found", { status: 404 });
  return Response.json(res.rows[0]);
}

