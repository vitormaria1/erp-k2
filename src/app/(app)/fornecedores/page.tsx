import Link from "next/link";

import { getDb } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/datetime";

type SupplierRow = {
  supplierName: string;
  invoicesCount: number;
  totalItems: number;
  totalAmount: number;
  lastIssuedAt: string | null;
  lastCreatedAt: string;
  lastInvoiceNumber: string | null;
};

function listSuppliers(q: string): SupplierRow[] {
  const db = getDb();

  const where = q.trim() ? "WHERE pi.supplier_name IS NOT NULL AND pi.supplier_name != '' AND pi.supplier_name LIKE ?" : "WHERE pi.supplier_name IS NOT NULL AND pi.supplier_name != ''";
  const params = q.trim() ? [`%${q.trim()}%`] : [];

  return db
    .prepare(
      `
      SELECT
        pi.supplier_name as supplierName,
        COUNT(*) as invoicesCount,
        COALESCE(SUM((
          SELECT COUNT(*)
          FROM purchase_invoice_items pii
          WHERE pii.purchase_invoice_id = pi.id
        )), 0) as totalItems,
        COALESCE(SUM((
          SELECT SUM(pii.quantity * pii.unit_cost)
          FROM purchase_invoice_items pii
          WHERE pii.purchase_invoice_id = pi.id
        )), 0) as totalAmount,
        MAX(pi.issued_at) as lastIssuedAt,
        MAX(pi.created_at) as lastCreatedAt,
        (
          SELECT pi2.number
          FROM purchase_invoices pi2
          WHERE pi2.supplier_name = pi.supplier_name
          ORDER BY pi2.created_at DESC
          LIMIT 1
        ) as lastInvoiceNumber
      FROM purchase_invoices pi
      ${where}
      GROUP BY pi.supplier_name
      ORDER BY MAX(pi.created_at) DESC, pi.supplier_name ASC
    `
    )
    .all(...params) as SupplierRow[];
}

function summarizeSuppliers(rows: SupplierRow[]) {
  return {
    suppliersCount: rows.length,
    invoicesCount: rows.reduce((sum, row) => sum + Number(row.invoicesCount), 0),
    totalAmount: rows.reduce((sum, row) => sum + Number(row.totalAmount), 0),
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

export default async function FornecedoresPage(props: { searchParams?: Promise<{ q?: string }> }) {
  const sp = (await props.searchParams) ?? {};
  const q = sp.q?.trim() ?? "";
  const rows = listSuppliers(q);
  const summary = summarizeSuppliers(rows);
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fornecedores</h1>
          <div className="text-sm text-[var(--muted)]">
            Diretório operacional gerado a partir das notas de compra já lançadas.
          </div>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <form className="flex gap-2" action="/fornecedores" method="GET">
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar fornecedor..."
              className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm outline-none md:w-[360px]"
            />
            <button className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">Buscar</button>
          </form>
          <Link
            href="/compras/nova"
            className="rounded-xl bg-[var(--k2-red-2)] px-4 py-3 text-center text-sm font-semibold text-white"
          >
            Nova nota de compra
          </Link>
        </div>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Fornecedores" value={String(summary.suppliersCount)} sub="Com compras registradas" />
        <StatCard label="Notas lançadas" value={String(summary.invoicesCount)} sub="Histórico consolidado" />
        <StatCard label="Valor movimentado" value={money.format(summary.totalAmount)} sub="Baseado nos itens comprados" />
      </section>

      <div className="mt-6 overflow-hidden rounded-2xl border bg-[var(--card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Fornecedor</th>
              <th className="px-4 py-3">Notas</th>
              <th className="px-4 py-3">Itens</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Última emissão</th>
              <th className="px-4 py-3">Último lançamento</th>
              <th className="px-4 py-3">Última nota</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.supplierName} className="border-t">
                <td className="px-4 py-3 font-semibold">{row.supplierName}</td>
                <td className="px-4 py-3">{row.invoicesCount}</td>
                <td className="px-4 py-3">{row.totalItems}</td>
                <td className="px-4 py-3 font-semibold">{money.format(Number(row.totalAmount ?? 0))}</td>
                <td className="px-4 py-3">{formatDate(row.lastIssuedAt)}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{formatDateTime(row.lastCreatedAt)}</td>
                <td className="px-4 py-3">{row.lastInvoiceNumber ?? "-"}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-[var(--muted)]" colSpan={7}>
                  Nenhum fornecedor encontrado. Lance uma nota em <Link href="/compras/nova" className="font-semibold text-[var(--k2-red-2)]">Compras</Link> para começar.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
