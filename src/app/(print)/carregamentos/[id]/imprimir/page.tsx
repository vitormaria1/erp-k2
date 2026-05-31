import Image from "next/image";
import { notFound } from "next/navigation";

import { PrintButtons, PrintOnLoad } from "@/app/(print)/pedidos/[id]/imprimir/print-client";
import { getDb } from "@/lib/db";

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

  const created = new Date(data.loading.createdAt).toLocaleString("pt-BR");

  return (
    <div className="mx-auto max-w-3xl p-8 print:p-0">
      <PrintOnLoad />
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-4">
          <Image src="/k2-logo.jpeg" alt="K2 Salgados" width={72} height={72} priority />
          <div>
            <div className="text-xl font-extrabold tracking-tight">K2 Salgados</div>
            <div className="text-sm text-black/70">Carregamento (lista de separação)</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-black/70">Criado em</div>
          <div className="text-sm font-bold">{created}</div>
          <div className="text-xs text-black/60 break-all">{data.loading.id}</div>
        </div>
      </div>

      {data.loading.notes ? (
        <div className="mt-4 rounded-2xl border p-4 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-black/60">
            Observações
          </div>
          <div className="mt-1">{data.loading.notes}</div>
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.03] text-left">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3 text-right">Total (Qtd)</th>
            </tr>
          </thead>
          <tbody>
            {data.totals.map((it) => (
              <tr key={`${it.code}-${it.name}`} className="border-t">
                <td className="px-4 py-3 font-semibold">{it.code}</td>
                <td className="px-4 py-3">
                  {it.name}
                  <div className="text-xs text-black/60">{it.unit}</div>
                </td>
                <td className="px-4 py-3 text-right font-semibold">
                  {formatQty(it.unit, Number(it.totalQty))} {it.unit}
                </td>
              </tr>
            ))}
            {data.totals.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-black/60" colSpan={3}>
                  Nenhum item.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-2xl border p-4">
        <div className="text-sm font-extrabold">Pedidos no carregamento</div>
        <div className="mt-3 grid grid-cols-1 gap-1 text-xs">
          {data.orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div className="font-semibold">#{o.id}</div>
              <div className="text-right">
                <div className="font-semibold">
                  {o.customerTradeName ? o.customerTradeName : o.customerName}
                </div>
                {o.customerTradeName ? (
                  <div className="text-[11px] text-black/60">{o.customerName}</div>
                ) : null}
              </div>
            </div>
          ))}
          {data.orders.length === 0 ? (
            <div className="text-black/60">Nenhum pedido vinculado.</div>
          ) : null}
        </div>
      </div>

      <PrintButtons />
    </div>
  );
}
