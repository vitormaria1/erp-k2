import Image from "next/image";
import { notFound } from "next/navigation";

import { PrintButtons, PrintOnLoad } from "@/app/(print)/pedidos/[id]/imprimir/print-client";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/datetime";

type TotalsRow = {
  code: string;
  name: string;
  unit: string;
  totalQty: number;
};

type OrderRow = {
  id: number;
  customerName: string;
  customerTradeName: string | null;
};

function getLoadingPrintable(loadingId: string) {
  const db = getDb();
  const loading = db
    .prepare("SELECT id, notes, created_at as createdAt FROM loadings WHERE id = ?")
    .get(loadingId) as { id: string; notes: string | null; createdAt: string } | undefined;
  if (!loading) return null;

  const totals = db
    .prepare(
      `
      SELECT
        p.reference as code,
        p.description as name,
        p.unit as unit,
        SUM(oi.quantity) as totalQty
      FROM loading_orders lo
      JOIN order_items oi ON oi.order_id = lo.order_id
      JOIN products p ON p.id = oi.product_id
      WHERE lo.loading_id = ?
      GROUP BY p.reference, p.description, p.unit
      ORDER BY p.description
    `
    )
    .all(loadingId) as TotalsRow[];

  const orders = db
    .prepare(
      `
      SELECT
        o.id as id,
        c.name as customerName,
        c.trade_name as customerTradeName
      FROM loading_orders lo
      JOIN orders o ON o.id = lo.order_id
      JOIN customers c ON c.id = o.customer_id
      WHERE lo.loading_id = ?
      ORDER BY o.id ASC
    `
    )
    .all(loadingId) as OrderRow[];

  return { loading, totals, orders };
}

function isKgUnit(unit: string) {
  const u = unit.trim().toUpperCase();
  return u === "KG" || u === "KGS" || u === "KILOGRAMA" || u === "KILOGRAMAS";
}

function formatQty(unit: string, value: number) {
  const fmt = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: isKgUnit(unit) ? 3 : 0,
    minimumFractionDigits: isKgUnit(unit) ? 3 : 0,
  });
  return fmt.format(value);
}

export default async function PrintCarregamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = getLoadingPrintable(id);
  if (!data) notFound();

  const created = formatDateTime(data.loading.createdAt);

  return (
    <div
      id="print-fit-shell"
      className="loading-print-shell mx-auto w-full max-w-[210mm] p-3 print:w-[190mm] print:p-0"
    >
      <PrintOnLoad />
      <div id="print-fit-content" className="loading-print-content rounded-2xl bg-white">
        <div className="flex items-start justify-between border-b pb-2">
          <div className="flex items-center gap-3">
            <Image src="/k2-logo.jpeg" alt="K2 Salgados" width={52} height={52} priority />
            <div>
              <div className="text-lg font-extrabold tracking-tight">K2 Salgados</div>
              <div className="text-[11px] text-black/70">Carregamento (lista de separação)</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-black/70">Criado em</div>
            <div className="text-xs font-bold">{created}</div>
            <div className="max-w-[200px] text-[10px] text-black/60 break-all">{data.loading.id}</div>
          </div>
        </div>

        {data.loading.notes ? (
          <div className="mt-2 rounded-xl border p-2 text-[11px] leading-tight">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-black/60">
              Observações
            </div>
            <div className="mt-0.5 line-clamp-2">{data.loading.notes}</div>
          </div>
        ) : null}

        <div className="mt-2 overflow-hidden rounded-xl border">
          <table className="w-full table-fixed text-[11px] leading-tight">
            <thead className="bg-black/[0.03] text-left">
              <tr>
                <th className="w-[56px] px-2 py-1.5">Código</th>
                <th className="px-2 py-1.5">Produto</th>
                <th className="w-[96px] px-2 py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.totals.map((it) => (
                <tr key={`${it.code}-${it.name}`} className="border-t">
                  <td className="px-2 py-1 font-semibold">{it.code}</td>
                  <td className="px-2 py-1">
                    <div className="truncate">{it.name}</div>
                    <div className="text-[10px] text-black/60">{it.unit}</div>
                  </td>
                  <td className="px-2 py-1 text-right font-semibold">
                    {formatQty(it.unit, Number(it.totalQty))} {it.unit}
                  </td>
                </tr>
              ))}
              {data.totals.length === 0 ? (
                <tr>
                  <td className="px-2 py-4 text-black/60" colSpan={3}>
                    Nenhum item.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-2 rounded-xl border p-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-extrabold">Pedidos no carregamento</div>
            <div className="text-[10px] text-black/60">{data.orders.length} pedidos</div>
          </div>
          <div className="mt-2 space-y-1 text-[10px] leading-tight">
            {data.orders.map((o) => (
              <div key={o.id} className="rounded-md border px-2 py-1">
                <div className="font-semibold">#{o.id}</div>
                <div className="truncate font-medium">
                  {o.customerTradeName ? o.customerTradeName : o.customerName}
                </div>
                {o.customerTradeName ? (
                  <div className="truncate text-black/60">{o.customerName}</div>
                ) : null}
              </div>
            ))}
            {data.orders.length === 0 ? (
              <div className="text-black/60">Nenhum pedido vinculado.</div>
            ) : null}
          </div>
        </div>
      </div>

      <PrintButtons />
    </div>
  );
}
