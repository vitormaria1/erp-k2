import Link from "next/link";

import { getDb } from "@/lib/db";
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
};

function listProductionOrders(limit = 40): ProductionOrderRow[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT
        po.id as id,
        po.created_at as createdAt,
        po.status as status,
        po.completed_at as completedAt,
        po.notes as notes,
        (SELECT COUNT(*) FROM production_order_products pop WHERE pop.production_order_id = po.id) as productsCount
      FROM production_orders po
      ORDER BY po.created_at DESC
      LIMIT ?
    `
    )
    .all(limit) as ProductionOrderRow[];
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

export default function ProducaoPage() {
  const orders = listProductionOrders();
  const products = listProductsForProduction();
  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <h1 className="text-2xl font-semibold">Produção</h1>

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
              <th className="px-4 py-3">Obs.</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="px-4 py-3">{new Date(o.createdAt).toLocaleString("pt-BR")}</td>
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
                        Finalizada {o.completedAt ? new Date(o.completedAt).toLocaleString("pt-BR") : ""}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {orders.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-[var(--muted)]" colSpan={5}>
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
