import Link from "next/link";

import { listStockProducts } from "@/lib/queries";
import { PRODUCT_STOCK_COLUMNS } from "@/lib/product-columns";
import { StockTableClient } from "./stock-table-client";

export default async function EstoquePage(props: { searchParams?: Promise<{ q?: string }> }) {
  const sp = (await props.searchParams) ?? {};
  const q = sp.q ?? "";
  const rows = listStockProducts({ q });
  const summary = {
    total: rows.length,
    lowStock: rows.filter((row) => {
      const stock = Number(row.stock_qty ?? 0);
      const min = row.min_stock == null ? null : Number(row.min_stock);
      return min != null && stock <= min;
    }).length,
    withPrice: rows.filter((row) => row.price != null).length,
    inventoryValue: rows.reduce((sum, row) => {
      const stock = Number(row.stock_qty ?? 0);
      const cost = Number(row.cost ?? 0);
      return sum + stock * cost;
    }, 0),
  };
  const kindRows = Array.from(
    rows.reduce((map, row) => {
      const kind = String(row.kind ?? "SEM_TIPO");
      const current = map.get(kind) ?? { kind, count: 0, stockValue: 0, estimatedMargin: 0, pricedItems: 0 };
      const stock = Number(row.stock_qty ?? 0);
      const cost = Number(row.cost ?? 0);
      const price = Number(row.price ?? 0);
      const hasMargin = price > 0;
      current.count += 1;
      current.stockValue += stock * cost;
      if (hasMargin) {
        current.estimatedMargin += ((price - cost) / price) * 100;
        current.pricedItems += 1;
      }
      map.set(kind, current);
      return map;
    }, new Map<string, { kind: string; count: number; stockValue: number; estimatedMargin: number; pricedItems: number }>())
  ).map(([, value]) => value);
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1560px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Produtos</h1>
          <div className="text-sm text-[var(--muted)]">
            Ajuste entradas/saídas, edite produtos e personalize as colunas da listagem.
          </div>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:justify-end">
          <Link className="rounded-xl border px-4 py-3 text-sm font-semibold" href="/estoque/novo">
            Novo produto
          </Link>
          <form className="flex flex-col gap-2 sm:flex-row" action="/estoque" method="GET">
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por descrição, referência..."
              className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm outline-none md:w-[420px]"
            />
            <button className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">
              Buscar
            </button>
          </form>
        </div>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Produtos</div>
          <div className="mt-2 text-3xl font-semibold">{summary.total}</div>
          <div className="mt-1 text-sm text-[var(--muted)]">Cadastros no resultado atual</div>
        </div>
        <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Estoque baixo</div>
          <div className="mt-2 text-3xl font-semibold">{summary.lowStock}</div>
          <div className="mt-1 text-sm text-[var(--muted)]">Abaixo do mínimo configurado</div>
        </div>
        <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Com preço</div>
          <div className="mt-2 text-3xl font-semibold">{summary.withPrice}</div>
          <div className="mt-1 text-sm text-[var(--muted)]">Itens com preço de venda definido</div>
        </div>
        <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Valor em custo</div>
          <div className="mt-2 text-3xl font-semibold">{money.format(summary.inventoryValue)}</div>
          <div className="mt-1 text-sm text-[var(--muted)]">Estoque atual x custo unitário</div>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
          <h2 className="text-base font-semibold">Produtos por tipo</h2>
          <div className="mt-4 space-y-3">
            {kindRows.map((kindRow) => (
              <div key={kindRow.kind} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold">{kindRow.kind}</div>
                  <div className="text-sm text-[var(--muted)]">{kindRow.count} itens</div>
                </div>
                <div className="mt-2 text-sm text-[var(--muted)]">
                  Estoque a custo: {money.format(kindRow.stockValue)}
                </div>
                <div className="mt-1 text-sm text-[var(--muted)]">
                  Margem estimada média:{" "}
                  {kindRow.pricedItems > 0 ? `${(kindRow.estimatedMargin / kindRow.pricedItems).toFixed(1)}%` : "-"}
                </div>
              </div>
            ))}
            {kindRows.length === 0 ? (
              <div className="rounded-xl border p-4 text-sm text-[var(--muted)]">Nenhum tipo encontrado.</div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
          <h2 className="text-base font-semibold">Leitura rápida de margem</h2>
          <div className="mt-4 space-y-3">
            {rows
              .filter((row) => Number(row.price ?? 0) > 0)
              .slice(0, 8)
              .map((row) => {
                const price = Number(row.price ?? 0);
                const cost = Number(row.cost ?? 0);
                const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
                return (
                  <div key={String(row.id)} className="rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{String(row.description ?? "-")}</div>
                        <div className="text-xs text-[var(--muted)]">{String(row.reference ?? "-")}</div>
                      </div>
                      <div className="text-sm font-semibold">{margin.toFixed(1)}%</div>
                    </div>
                    <div className="mt-2 text-sm text-[var(--muted)]">
                      Custo {money.format(cost)} · Preço {money.format(price)}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </section>

      <StockTableClient rows={rows} columns={PRODUCT_STOCK_COLUMNS} />
    </div>
  );
}
