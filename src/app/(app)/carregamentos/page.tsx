import Link from "next/link";

import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/datetime";
import { SelectOrdersClient, type OrderRow } from "./select-orders-client";

type Row = {
  id: string;
  createdAt: string;
  notes: string | null;
  ordersCount: number;
};

function listOrdersForLoading(limit = 80): OrderRow[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT
        o.id as id,
        o.created_at as createdAt,
        o.status as status,
        c.name as customerName,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as itemsCount
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      ORDER BY o.created_at DESC
      LIMIT ?
    `
    )
    .all(limit) as OrderRow[];
}

function listLoadings(limit = 50): Row[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT
        l.id as id,
        l.created_at as createdAt,
        l.notes as notes,
        (SELECT COUNT(*) FROM loading_orders lo WHERE lo.loading_id = l.id) as ordersCount
      FROM loadings l
      ORDER BY l.created_at DESC
      LIMIT ?
    `
    )
    .all(limit) as Row[];
}

export default function CarregamentosPage() {
  const rows = listLoadings();
  const orders = listOrdersForLoading();
  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Carregamentos</h1>
          <div className="text-sm text-[var(--muted)]">
            Agrupa pedidos selecionados para montar a carga.
          </div>
        </div>
        <Link
          href="#selecionar"
          className="rounded-xl border bg-[var(--card)] px-4 py-3 text-sm font-semibold"
        >
          Selecionar pedidos
        </Link>
      </div>

      <div id="selecionar">
        <SelectOrdersClient orders={orders} />
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border bg-[var(--card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Criado em</th>
              <th className="px-4 py-3">Pedidos</th>
              <th className="px-4 py-3">Obs.</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-3">{formatDateTime(r.createdAt)}</td>
                <td className="px-4 py-3 font-semibold">{r.ordersCount}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{r.notes ?? "-"}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/carregamentos/${r.id}/imprimir`}
                    className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white"
                  >
                    Imprimir
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-[var(--muted)]" colSpan={4}>
                  Nenhum carregamento ainda. Selecione pedidos acima para criar.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
