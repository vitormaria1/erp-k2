import { adjustStockAction } from "./actions";
import { listProducts } from "@/lib/queries";

export default async function EstoquePage(props: { searchParams?: Promise<{ q?: string }> }) {
  const sp = (await props.searchParams) ?? {};
  const q = sp.q ?? "";
  const rows = listProducts({ q });

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Estoque</h1>
          <div className="text-sm text-[var(--muted)]">
            Ajuste entradas/saídas e acompanhe quantidades.
          </div>
        </div>
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

      <div className="mt-5 overflow-x-auto rounded-2xl border bg-[var(--card)] shadow-sm">
        <table className="min-w-[1600px] w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Ref.</th>
              <th className="px-4 py-3">Tele.Ref.</th>
              <th className="px-4 py-3">Barras</th>
              <th className="px-4 py-3">GTIN</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3">Composição</th>
              <th className="px-4 py-3">Un.</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Qtd.</th>
              <th className="px-4 py-3">Mín.</th>
              <th className="px-4 py-3">Custo</th>
              <th className="px-4 py-3">Preço</th>
              <th className="px-4 py-3">NCM</th>
              <th className="px-4 py-3">Data Cad.</th>
              <th className="px-4 py-3">Últ. Atualiz.</th>
              <th className="px-4 py-3">Receita</th>
              <th className="px-4 py-3">Ajustar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t align-top">
                <td className="px-4 py-3 font-medium">{p.reference}</td>
                <td className="px-4 py-3">{p.teleRef ?? "-"}</td>
                <td className="px-4 py-3">{p.barcode ?? "-"}</td>
                <td className="px-4 py-3">{p.gtin ?? "-"}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold">{p.description}</div>
                  <div className="text-xs text-[var(--muted)]">{p.unit}</div>
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted)]">{p.composition ?? "-"}</td>
                <td className="px-4 py-3">{p.unit}</td>
                <td className="px-4 py-3">{p.kind}</td>
                <td
                  className={[
                    "px-4 py-3 font-semibold",
                    p.stockQty < 0 ? "text-[var(--k2-red-2)]" : "",
                  ].join(" ")}
                >
                  {p.stockQty.toFixed(3)}
                </td>
                <td className="px-4 py-3">{p.minStock != null ? p.minStock.toFixed(3) : "-"}</td>
                <td className="px-4 py-3">{p.cost != null ? p.cost.toFixed(4) : "-"}</td>
                <td className="px-4 py-3">{p.price != null ? p.price.toFixed(4) : "-"}</td>
                <td className="px-4 py-3">{p.classFiscalNcm ?? "-"}</td>
                <td className="px-4 py-3">{p.dataCad ?? "-"}</td>
                <td className="px-4 py-3">{p.ultimaAtualiz ?? "-"}</td>
                <td className="px-4 py-3">
                  <a
                    className="rounded-xl border bg-[var(--card)] px-3 py-2 text-xs font-semibold hover:bg-black/[0.03]"
                    href={`/estoque/${p.id}/receita`}
                  >
                    Composição
                  </a>
                  <div className="mt-1 text-xs text-[var(--muted)]">min {p.minStock ?? "-"}</div>
                </td>
                <td className="px-4 py-3">
                  <form action={adjustStockAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="productId" value={p.id} />
                    <select
                      name="type"
                      className="rounded-xl border bg-[var(--card)] px-3 py-2 text-xs"
                      defaultValue="IN"
                    >
                      <option value="IN">Entrada</option>
                      <option value="OUT">Saída</option>
                      <option value="ADJUSTMENT">Ajuste (define)</option>
                    </select>
                    <input
                      name="quantity"
                      type="number"
                      step="0.001"
                      min="0"
                      className="w-28 rounded-xl border bg-[var(--card)] px-3 py-2 text-xs"
                      placeholder="Qtd"
                      required
                    />
                    <input
                      name="reason"
                      className="w-44 rounded-xl border bg-[var(--card)] px-3 py-2 text-xs"
                      placeholder="Motivo (opcional)"
                    />
                    <button className="rounded-xl bg-[var(--k2-red-2)] px-3 py-2 text-xs font-semibold text-white">
                      Aplicar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-[var(--muted)]" colSpan={6}>
                  Nenhum produto encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
