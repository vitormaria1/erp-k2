import { Topbar } from "@/components/topbar";
import { listDashboardTasks } from "@/lib/dashboard-tasks";
import { getDashboardMetrics, listLowStock } from "@/lib/queries";
import {
  createDashboardTaskAction,
  deleteDashboardTaskAction,
  toggleDashboardTaskDoneAction,
  updateDashboardTaskAction,
} from "./actions";

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
  const tasks = listDashboardTasks(12);
  const lowStock = listLowStock(6);
  const doneCount = tasks.filter((task) => Boolean(task.done)).length;

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
            <div>
              <h2 className="text-base font-semibold">LISTA DE TAREFAS DO DIA</h2>
              <div className="text-sm text-[var(--muted)]">
                {doneCount}/{tasks.length} conclu&iacute;das
              </div>
            </div>
          </div>
          <form action={createDashboardTaskAction} className="mt-4 grid gap-3 rounded-xl border bg-black/[0.02] p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
            <input
              name="title"
              required
              placeholder="Nova tarefa"
              className="rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
            />
            <input
              name="notes"
              placeholder="Observa&ccedil;&otilde;es"
              className="rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
            />
            <button className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">
              Adicionar
            </button>
          </form>
          <div className="mt-4 space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="rounded-xl border p-4">
                <div className="flex items-start gap-3">
                  <form action={toggleDashboardTaskDoneAction} className="pt-1">
                    <input type="hidden" name="id" value={task.id} />
                    <input type="hidden" name="done" value={task.done ? "0" : "1"} />
                    <button
                      type="submit"
                      aria-label={task.done ? "Marcar tarefa como pendente" : "Marcar tarefa como concluída"}
                      className={[
                        "flex h-5 w-5 items-center justify-center rounded border",
                        task.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-black/20 bg-white",
                      ].join(" ")}
                    >
                      {task.done ? "✓" : ""}
                    </button>
                  </form>
                  <form action={updateDashboardTaskAction} className="flex-1 space-y-3">
                    <input type="hidden" name="id" value={task.id} />
                    <input type="hidden" name="done" value={task.done ? "on" : ""} />
                    <input
                      name="title"
                      defaultValue={task.title}
                      className={[
                        "w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm font-medium",
                        task.done ? "text-[var(--muted)] line-through" : "",
                      ].join(" ")}
                    />
                    <textarea
                      name="notes"
                      defaultValue={task.notes ?? ""}
                      rows={2}
                      placeholder="Observa&ccedil;&otilde;es"
                      className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-[var(--muted)]">
                        Atualizada em {new Date(task.updatedAt).toLocaleString("pt-BR")}
                      </div>
                      <div className="flex gap-2">
                        <button className="rounded-xl border px-3 py-2 text-xs font-semibold">
                          Salvar
                        </button>
                      </div>
                    </div>
                  </form>
                  <form action={deleteDashboardTaskAction}>
                    <input type="hidden" name="id" value={task.id} />
                    <button className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-[var(--k2-red-2)]">
                      Excluir
                    </button>
                  </form>
                </div>
              </div>
            ))}
            {tasks.length === 0 ? (
              <div className="rounded-xl border p-6 text-sm text-[var(--muted)]">
                Nenhuma tarefa cadastrada ainda. Use o formul&aacute;rio acima para montar sua checklist.
              </div>
            ) : null}
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
