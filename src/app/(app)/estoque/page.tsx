import Link from "next/link";

import { listStockProducts } from "@/lib/queries";
import { PRODUCT_STOCK_COLUMNS } from "@/lib/product-columns";
import { StockTableClient } from "./stock-table-client";

export default async function EstoquePage(props: { searchParams?: Promise<{ q?: string }> }) {
  const sp = (await props.searchParams) ?? {};
  const q = sp.q ?? "";
  const rows = listStockProducts({ q });

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Produtos</h1>
          <div className="text-sm text-[var(--muted)]">
            Ajuste entradas/saídas, edite produtos e personalize as colunas da listagem.
          </div>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <Link className="rounded-xl border px-4 py-3 text-sm font-semibold" href="/estoque/novo">
            Novo produto
          </Link>
          <form className="flex gap-2" action="/estoque" method="GET">
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

      <StockTableClient rows={rows} columns={PRODUCT_STOCK_COLUMNS} />
    </div>
  );
}
