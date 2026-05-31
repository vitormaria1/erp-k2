import Link from "next/link";

import { getDb } from "@/lib/db";

type PurchaseInvoiceRow = {
  id: string;
  createdAt: string;
  issuedAt: string | null;
  number: string | null;
  supplierName: string | null;
  itemsCount: number;
  totalQty: number;
};

function listPurchaseInvoices(limit = 60): PurchaseInvoiceRow[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT
        pi.id as id,
        pi.created_at as createdAt,
        pi.issued_at as issuedAt,
        pi.number as number,
        pi.supplier_name as supplierName,
        (SELECT COUNT(*) FROM purchase_invoice_items pii WHERE pii.purchase_invoice_id = pi.id) as itemsCount,
        (
          SELECT COALESCE(SUM(pii.quantity), 0)
          FROM purchase_invoice_items pii
          WHERE pii.purchase_invoice_id = pi.id
        ) as totalQty
      FROM purchase_invoices pi
      ORDER BY pi.created_at DESC
      LIMIT ?
    `
    )
    .all(limit) as PurchaseInvoiceRow[];
}

export default function ComprasPage() {
  const invoices = listPurchaseInvoices();
  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Compras</h1>
          <div className="text-sm text-[var(--muted)]">
            Entrada manual de notas: atualiza estoque e custo dos insumos.
          </div>
        </div>
        <Link
          href="/compras/nova"
          className="rounded-xl bg-[var(--k2-red-2)] px-4 py-3 text-sm font-semibold text-white"
        >
          Nova nota (entrada)
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border bg-[var(--card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Criado em</th>
              <th className="px-4 py-3">Fornecedor</th>
              <th className="px-4 py-3">Nº</th>
              <th className="px-4 py-3">Emissão</th>
              <th className="px-4 py-3">Itens</th>
              <th className="px-4 py-3">Qtd total</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-3">{new Date(r.createdAt).toLocaleString("pt-BR")}</td>
                <td className="px-4 py-3 font-semibold">{r.supplierName ?? "-"}</td>
                <td className="px-4 py-3">{r.number ?? "-"}</td>
                <td className="px-4 py-3">{r.issuedAt ? new Date(r.issuedAt).toLocaleDateString("pt-BR") : "-"}</td>
                <td className="px-4 py-3">{r.itemsCount}</td>
                <td className="px-4 py-3 font-semibold">{Number(r.totalQty).toFixed(3)}</td>
              </tr>
            ))}
            {invoices.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-[var(--muted)]" colSpan={6}>
                  Nenhuma nota de compra lançada ainda.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

