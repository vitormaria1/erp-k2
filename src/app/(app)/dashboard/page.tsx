import { Topbar } from "@/components/topbar";
import { getDashboardMetrics, listLowStock, listRecentOrders } from "@/lib/queries";

function StatCard(props: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {props.label}
      </div>
      <div className="mt-2 text-3xl font-semibold">{props.value}</div>
      {props.sub ? <div className="mt-1 text-sm text-[var(--muted)]">{props.sub}</div> : null}
    </div>
  );
}

export default function DashboardPage() {
  const metrics = getDashboardMetrics();
  const recent = listRecentOrders(6);
  const lowStock = listLowStock(6);

  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <div className="mx-auto max-w-6xl">
      <Topbar />

      <section className="grid grid-cols-1 gap-4 px-6 md:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Pedidos hoje" value={String(metrics.ordersToday)} sub="Atualizado agora" />
        <StatCard label="Notas emitidas" value={String(metrics.invoicesToday)} sub="Hoje" />
        <StatCard label="Itens em estoque" value={String(metrics.productsCount)} sub="Cadastros" />
        <StatCard
          label="Produção hoje"
          value={String(metrics.productionToday)}
          sub="Movimentações IN (PRODUCTION)"
        />
        <StatCard label="Faturamento (mês)" value={money.format(metrics.revenueMonth)} />
      </section>

      <section className="grid grid-cols-1 gap-4 px-6 py-6 lg:grid-cols-3">
        <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Pedidos recentes</h2>
            <a href="/pedidos" className="text-sm font-medium text-[var(--k2-red-2)]">
              Ver todos
            </a>
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Itens</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id} className="border-t">
                    <td className="px-4 py-3 font-medium">#{o.id}</td>
                    <td className="px-4 py-3">{o.customerName}</td>
                    <td className="px-4 py-3">{o.itemsCount}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-black/[0.04] px-3 py-1 text-xs font-semibold">
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {recent.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-[var(--muted)]" colSpan={4}>
                      Nenhum pedido ainda. Clique em “Novo pedido”.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Estoque baixo</h2>
            <a href="/estoque" className="text-sm font-medium text-[var(--k2-red-2)]">
              Ver todos
            </a>
          </div>
          <div className="mt-4 space-y-3">
            {lowStock.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{p.description}</div>
                  <div className="text-xs text-[var(--muted)]">
                    Mínimo: {p.minStock} {p.unit}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{p.stockQty.toFixed(2)}</div>
                  <div className="text-xs text-[var(--k2-red-2)]">em estoque</div>
                </div>
              </div>
            ))}
            {lowStock.length === 0 ? (
              <div className="rounded-xl border p-4 text-sm text-[var(--muted)]">
                Defina `min_stock` nos produtos para acompanhar estoque baixo.
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

