import Link from "next/link";

import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/datetime";
import { cancelProductionOrderAction, completeProductionOrderAction, createProductionOrderAction } from "./actions";
import { ProductionOrderClient } from "./production-order-client";
import type { ProductOpt } from "./types";

type ProductionOrderRow = {
  id: string;
  createdAt: string;
  status: string;
  completedAt: string | null;
  notes: string | null;
  productsCount: number;
  totalPlannedQty: number;
  totalInputsQty: number;
  estimatedInputCost: number;
};

type InputUsageRow = {
  inputName: string;
  inputRef: string;
  totalQty: number;
  estimatedCost: number;
};

function listProductionOrders(opts: { q?: string; status?: string; limit?: number } = {}): ProductionOrderRow[] {
  const db = getDb();
  const q = (opts.q ?? "").trim();
  const status = (opts.status ?? "").trim();
  const limit = opts.limit ?? 80;
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (q) {
    where.push("COALESCE(po.notes, '') LIKE ?");
    params.push(`%${q}%`);
  }
  if (status) {
    where.push("po.status = ?");
    params.push(status);
  }

  return db
    .prepare(
      `
      SELECT
        po.id as id,
        po.created_at as createdAt,
        po.status as status,
        po.completed_at as completedAt,
        po.notes as notes,
        (SELECT COUNT(*) FROM production_order_products pop WHERE pop.production_order_id = po.id) as productsCount,
        (
          SELECT COALESCE(SUM(pop.quantity), 0)
          FROM production_order_products pop
          WHERE pop.production_order_id = po.id
        ) as totalPlannedQty,
        (
          SELECT COALESCE(SUM(poi.total_quantity), 0)
          FROM production_order_inputs poi
          WHERE poi.production_order_id = po.id
        ) as totalInputsQty,
        (
          SELECT COALESCE(SUM(poi.total_quantity * COALESCE(p.cost, 0)), 0)
          FROM production_order_inputs poi
          JOIN products p ON p.id = poi.input_product_id
          WHERE poi.production_order_id = po.id
        ) as estimatedInputCost
      FROM production_orders po
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY po.created_at DESC
      LIMIT ?
    `
    )
    .all(...params, limit) as ProductionOrderRow[];
}

function listProductsForProduction(): ProductOpt[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT id, reference, description, unit
      FROM products
      ORDER BY CAST(reference AS INTEGER) ASC, reference ASC
    `
    )
    .all() as ProductOpt[];
}

function listTopInputUsage(limit = 8): InputUsageRow[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT
        p.description as inputName,
        p.reference as inputRef,
        COALESCE(SUM(poi.total_quantity), 0) as totalQty,
        COALESCE(SUM(poi.total_quantity * COALESCE(p.cost, 0)), 0) as estimatedCost
      FROM production_order_inputs poi
      JOIN products p ON p.id = poi.input_product_id
      GROUP BY p.id, p.description, p.reference
      ORDER BY totalQty DESC, estimatedCost DESC
      LIMIT ?
    `
    )
    .all(limit) as InputUsageRow[];
}

function summarizeOrders(orders: ProductionOrderRow[]) {
  return {
    total: orders.length,
    open: orders.filter((order) => order.status === "OPEN").length,
    completed: orders.filter((order) => order.status === "COMPLETED").length,
    canceled: orders.filter((order) => order.status === "CANCELED").length,
    plannedQty: orders.reduce((sum, order) => sum + Number(order.totalPlannedQty ?? 0), 0),
    inputsQty: orders.reduce((sum, order) => sum + Number(order.totalInputsQty ?? 0), 0),
    estimatedCost: orders.reduce((sum, order) => sum + Number(order.estimatedInputCost ?? 0), 0),
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

function MiniBarChart(props: { title: string; items: Array<{ label: string; value: number; sub?: string }> }) {
  const max = Math.max(1, ...props.items.map((item) => item.value));
  return (
    <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
      <h2 className="text-base font-semibold">{props.title}</h2>
      <div className="mt-4 space-y-3">
        {props.items.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{item.label}</div>
                {item.sub ? <div className="text-xs text-[var(--muted)]">{item.sub}</div> : null}
              </div>
              <div className="shrink-0 font-semibold">{item.value.toFixed(3)}</div>
            </div>
            <div className="h-2 rounded-full bg-black/[0.06]">
              <div className="h-2 rounded-full bg-[var(--k2-red-2)]" style={{ width: `${(item.value / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function ProducaoPage(props: {
  searchParams?: Promise<{ q?: string; status?: string }>;
}) {
  const sp = (await props.searchParams) ?? {};
  const q = sp.q ?? "";
  const status = sp.status ?? "";
  const orders = listProductionOrders({ q, status });
  const products = listProductsForProduction();
  const topInputs = listTopInputUsage();
  const summary = summarizeOrders(orders);
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Produção</h1>
          <div className="text-sm text-[var(--muted)]">
            Planeje ordens, consuma insumos e acompanhe o andamento da fábrica.
          </div>
        </div>
        <form className="flex flex-col gap-2 md:flex-row md:items-center" action="/producao" method="GET">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por observação..."
            className="rounded-xl border bg-[var(--card)] px-4 py-3 text-sm md:w-[320px]"
          />
          <select
            name="status"
            defaultValue={status}
            className="rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
          >
            <option value="">Todos os status</option>
            <option value="OPEN">Em aberto</option>
            <option value="COMPLETED">Concluídas</option>
            <option value="CANCELED">Canceladas</option>
          </select>
          <button className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">Filtrar</button>
        </form>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Ordens" value={String(summary.total)} sub="Resultado atual" />
        <StatCard label="Em aberto" value={String(summary.open)} sub="Consumindo insumos" />
        <StatCard label="Concluídas" value={String(summary.completed)} sub="Entrada no estoque feita" />
        <StatCard label="Qtd planejada" value={summary.plannedQty.toFixed(3)} sub="Produtos finais" />
        <StatCard label="Insumos consumidos" value={summary.inputsQty.toFixed(3)} sub="Base das receitas" />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
          <h2 className="text-base font-semibold">Custo estimado das OPs filtradas</h2>
          <div className="mt-3 text-3xl font-semibold">{money.format(summary.estimatedCost)}</div>
          <div className="mt-1 text-sm text-[var(--muted)]">
            Soma de `insumo consumido x custo atual` por ordem.
          </div>
        </div>
        <div className="lg:col-span-2">
          <MiniBarChart
            title="Consumo por insumo"
            items={topInputs.map((input) => ({
              label: `${input.inputRef} · ${input.inputName}`,
              value: Number(input.totalQty ?? 0),
              sub: money.format(Number(input.estimatedCost ?? 0)),
            }))}
          />
        </div>
      </section>

      <div className="mt-2 rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
        <div className="text-sm font-semibold">Nova ordem de produção</div>
        <div className="mt-1 text-sm text-[var(--muted)]">
          Selecione os produtos e quantidades. O sistema gera a lista de insumos (totais) com base na composição.
        </div>

        <form action={createProductionOrderAction} className="mt-4">
          <label className="block space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Observações
            </div>
            <input
              name="notes"
              className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
              placeholder="Opcional"
            />
          </label>

          <ProductionOrderClient products={products} />

          <button className="mt-4 rounded-xl bg-[var(--k2-red-2)] px-5 py-3 text-sm font-semibold text-white">
            Gerar lista de insumos
          </button>
        </form>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border bg-[var(--card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Criado em</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Produtos</th>
              <th className="px-4 py-3">Qtd planejada</th>
              <th className="px-4 py-3">Insumos</th>
              <th className="px-4 py-3">Custo estimado</th>
              <th className="px-4 py-3">Obs.</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="px-4 py-3">{formatDateTime(o.createdAt)}</td>
                <td className="px-4 py-3">
                  <span
                    className={[
                      "inline-flex rounded-full px-2 py-1 text-xs font-semibold",
                      o.status === "COMPLETED" ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700",
                    ].join(" ")}
                  >
                    {o.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold">{o.productsCount}</td>
                <td className="px-4 py-3">{Number(o.totalPlannedQty).toFixed(3)}</td>
                <td className="px-4 py-3">{Number(o.totalInputsQty).toFixed(3)}</td>
                <td className="px-4 py-3 font-semibold">{money.format(Number(o.estimatedInputCost ?? 0))}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{o.notes ?? "-"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/producao/${o.id}/imprimir`}
                      className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white"
                    >
                      Imprimir
                    </Link>
                    {o.status !== "COMPLETED" ? (
                      <>
                        {o.status === "OPEN" ? (
                          <form action={completeProductionOrderAction}>
                            <input type="hidden" name="productionOrderId" value={o.id} />
                            <button className="rounded-xl bg-[var(--k2-red-2)] px-3 py-2 text-xs font-semibold text-white">
                              Finalizar (entrada no estoque)
                            </button>
                          </form>
                        ) : null}
                        {o.status === "OPEN" ? (
                          <form action={cancelProductionOrderAction}>
                            <input type="hidden" name="productionOrderId" value={o.id} />
                            <button className="rounded-xl border bg-[var(--card)] px-3 py-2 text-xs font-semibold">
                              Cancelar (estornar insumos)
                            </button>
                          </form>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">
                        Finalizada {o.completedAt ? formatDateTime(o.completedAt) : ""}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {orders.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-[var(--muted)]" colSpan={8}>
                  Nenhuma ordem de produção ainda.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
