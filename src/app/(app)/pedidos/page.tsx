import Link from "next/link";

import { getDb } from "@/lib/db";
type Row = {
  id: number;
  createdAt: string;
  status: string;
  customerName: string;
  itemsCount: number;
  customerAddressOk: boolean;
};

function listOrders(limit = 50): Row[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        o.id as id,
        o.created_at as createdAt,
        o.status as status,
        c.name as customerName,
        c.street as customerStreet,
        c.number as customerNumber,
        c.neighborhood as customerNeighborhood,
        c.city as customerCity,
        c.uf as customerUf,
        c.cep as customerCep,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as itemsCount
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      ORDER BY o.created_at DESC
      LIMIT ?
    `
    )
    .all(limit) as Array<
    Omit<Row, "customerAddressOk"> & {
      customerStreet: string | null;
      customerNumber: string | null;
      customerNeighborhood: string | null;
      customerCity: string | null;
      customerUf: string | null;
      customerCep: string | null;
    }
  >;

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    status: r.status,
    customerName: r.customerName,
    itemsCount: r.itemsCount,
    customerAddressOk:
      !!r.customerStreet &&
      !!r.customerNumber &&
      !!r.customerNeighborhood &&
      !!r.customerCity &&
      !!r.customerUf &&
      !!r.customerCep,
  }));
}

export default function PedidosPage() {
  const orders = listOrders();
  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pedidos</h1>
          <div className="text-sm text-[var(--muted)]">Crie e acompanhe pedidos.</div>
        </div>
        <Link
          href="/pedidos/novo"
          className="rounded-xl bg-[var(--k2-red-2)] px-4 py-3 text-sm font-semibold text-white"
        >
          + Novo pedido
        </Link>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border bg-[var(--card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Itens</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Criado em</th>
              <th className="px-4 py-3">Fiscal</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="px-4 py-3 font-medium">#{o.id}</td>
                <td className="px-4 py-3">{o.customerName}</td>
                <td className="px-4 py-3">{o.itemsCount}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-black/[0.04] px-3 py-1 text-xs font-semibold">
                    {o.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">
                  {new Date(o.createdAt).toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <form action="/api/fiscal/orders/preview-danfe" method="post">
                      <input type="hidden" name="orderId" value={o.id} />
                      <button className="rounded-lg border px-3 py-1.5 text-xs font-semibold">
                        Preview DANFE
                      </button>
                    </form>
                    <form action="/api/fiscal/orders/issue" method="post">
                      <input type="hidden" name="orderId" value={o.id} />
                      <button
                        className="rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!o.customerAddressOk}
                        title={
                          o.customerAddressOk
                            ? "Emite NF-e em homologação (usa Focus)"
                            : "Cliente sem endereço completo (logradouro/número/bairro/cidade/UF/CEP)"
                        }
                      >
                        Emitir NF-e (H)
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {orders.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-[var(--muted)]" colSpan={6}>
                  Nenhum pedido ainda.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
