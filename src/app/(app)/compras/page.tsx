import Link from "next/link";

import { getDb } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/datetime";

type PurchaseInvoiceRow = {
  id: string;
  createdAt: string;
  issuedAt: string | null;
  number: string | null;
  supplierName: string | null;
  itemsCount: number;
  totalQty: number;
  totalAmount: number;
};

type PurchaseInvoiceItemRow = {
  id: string;
  purchaseInvoiceId: string;
  productReference: string;
  productDescription: string;
  unit: string;
  quantity: number;
  unitCost: number;
};

function listPurchaseInvoices(opts: { q?: string; limit?: number } = {}): PurchaseInvoiceRow[] {
  const db = getDb();
  const q = (opts.q ?? "").trim();
  const limit = opts.limit ?? 100;
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
        ) as totalQty,
        (
          SELECT COALESCE(SUM(pii.quantity * pii.unit_cost), 0)
          FROM purchase_invoice_items pii
          WHERE pii.purchase_invoice_id = pi.id
        ) as totalAmount
      FROM purchase_invoices pi
      ${q ? "WHERE COALESCE(pi.supplier_name, '') LIKE ? OR COALESCE(pi.number, '') LIKE ?" : ""}
      ORDER BY pi.created_at DESC
      LIMIT ?
    `
    )
    .all(...(q ? [`%${q}%`, `%${q}%`, limit] : [limit])) as PurchaseInvoiceRow[];
}

function listPurchaseInvoiceItems(invoiceIds: string[]) {
  const byInvoice = new Map<string, PurchaseInvoiceItemRow[]>();
  if (invoiceIds.length === 0) return byInvoice;
  const db = getDb();
  const placeholders = invoiceIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `
      SELECT
        pii.id as id,
        pii.purchase_invoice_id as purchaseInvoiceId,
        p.reference as productReference,
        p.description as productDescription,
        p.unit as unit,
        pii.quantity as quantity,
        pii.unit_cost as unitCost
      FROM purchase_invoice_items pii
      JOIN products p ON p.id = pii.product_id
      WHERE pii.purchase_invoice_id IN (${placeholders})
      ORDER BY pii.purchase_invoice_id ASC, p.description ASC
    `
    )
    .all(...invoiceIds) as PurchaseInvoiceItemRow[];

  for (const row of rows) {
    byInvoice.set(row.purchaseInvoiceId, [...(byInvoice.get(row.purchaseInvoiceId) ?? []), row]);
  }

  return byInvoice;
}

function summarizeInvoices(invoices: PurchaseInvoiceRow[]) {
  const suppliers = new Set(invoices.map((invoice) => invoice.supplierName).filter(Boolean));
  return {
    total: invoices.length,
    suppliers: suppliers.size,
    qty: invoices.reduce((sum, invoice) => sum + Number(invoice.totalQty ?? 0), 0),
    amount: invoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount ?? 0), 0),
  };
}

function StatCard(props: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{props.label}</div>
      <div className="mt-2 text-3xl font-semibold">{props.value}</div>
      <div className="mt-1 text-sm text-[var(--muted)]">{props.sub}</div>
    </div>
  );
}

export default async function ComprasPage(props: { searchParams?: Promise<{ q?: string }> }) {
  const sp = (await props.searchParams) ?? {};
  const q = sp.q ?? "";
  const invoices = listPurchaseInvoices({ q });
  const itemsByInvoice = listPurchaseInvoiceItems(invoices.map((invoice) => invoice.id));
  const summary = summarizeInvoices(invoices);
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Compras</h1>
          <div className="text-sm text-[var(--muted)]">
            Entrada manual de notas: atualiza estoque e custo dos insumos.
          </div>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <form className="flex gap-2" action="/compras" method="GET">
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por fornecedor ou número..."
              className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm md:w-[360px]"
            />
            <button className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">
              Buscar
            </button>
          </form>
          <Link
            href="/compras/nova"
            className="rounded-xl bg-[var(--k2-red-2)] px-4 py-3 text-sm font-semibold text-white"
          >
            Nova nota (entrada)
          </Link>
        </div>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Notas" value={String(summary.total)} sub="Resultado atual da busca" />
        <StatCard label="Fornecedores" value={String(summary.suppliers)} sub="Com notas lançadas" />
        <StatCard label="Qtd total" value={summary.qty.toFixed(3)} sub="Entradas registradas" />
        <StatCard label="Valor total" value={money.format(summary.amount)} sub="Baseado nos itens da nota" />
      </section>

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
              <th className="px-4 py-3">Valor</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((r) => {
              const items = itemsByInvoice.get(r.id) ?? [];
              const avgCost = items.length > 0 ? Number(r.totalAmount ?? 0) / Math.max(Number(r.totalQty ?? 0), 1) : 0;
              return (
                <>
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-3">{formatDateTime(r.createdAt)}</td>
                    <td className="px-4 py-3 font-semibold">{r.supplierName ?? "-"}</td>
                    <td className="px-4 py-3">{r.number ?? "-"}</td>
                    <td className="px-4 py-3">{formatDate(r.issuedAt)}</td>
                    <td className="px-4 py-3">{r.itemsCount}</td>
                    <td className="px-4 py-3 font-semibold">{Number(r.totalQty).toFixed(3)}</td>
                    <td className="px-4 py-3 font-semibold">{money.format(Number(r.totalAmount ?? 0))}</td>
                  </tr>
                  <tr key={`${r.id}-items`} className="border-t bg-black/[0.015]">
                    <td className="px-4 py-4" colSpan={7}>
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                          Itens da nota
                        </div>
                        <div className="text-xs text-[var(--muted)]">
                          Custo médio ponderado: {money.format(avgCost)}
                        </div>
                      </div>
                      <div className="mt-3 overflow-hidden rounded-xl border">
                        <table className="w-full text-xs">
                          <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
                            <tr>
                              <th className="px-3 py-2">Ref.</th>
                              <th className="px-3 py-2">Produto</th>
                              <th className="px-3 py-2 text-right">Qtd</th>
                              <th className="px-3 py-2 text-right">Custo unit.</th>
                              <th className="px-3 py-2 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((item) => (
                              <tr key={item.id} className="border-t">
                                <td className="px-3 py-2 font-semibold">{item.productReference}</td>
                                <td className="px-3 py-2">
                                  <div>{item.productDescription}</div>
                                  <div className="text-[11px] text-[var(--muted)]">{item.unit}</div>
                                </td>
                                <td className="px-3 py-2 text-right">{Number(item.quantity).toFixed(3)}</td>
                                <td className="px-3 py-2 text-right">{money.format(Number(item.unitCost ?? 0))}</td>
                                <td className="px-3 py-2 text-right font-semibold">
                                  {money.format(Number(item.quantity ?? 0) * Number(item.unitCost ?? 0))}
                                </td>
                              </tr>
                            ))}
                            {items.length === 0 ? (
                              <tr>
                                <td className="px-3 py-4 text-[var(--muted)]" colSpan={5}>
                                  Nenhum item encontrado para esta nota.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                </>
              );
            })}
            {invoices.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-[var(--muted)]" colSpan={7}>
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
