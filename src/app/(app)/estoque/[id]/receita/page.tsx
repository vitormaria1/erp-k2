import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@/lib/db";
import { addRecipeItemAction, removeRecipeItemAction } from "./actions";
import { InputSelectClient, type InputProductOpt } from "./input-select-client";

type Product = {
  id: string;
  reference: string;
  description: string;
  unit: string;
};

type RecipeRow = {
  inputId: string;
  inputReference: string;
  inputDescription: string;
  inputUnit: string;
  quantity: number;
  inputCost: number | null;
};

function getData(productId: string) {
  const db = getDb();
  const product = db
    .prepare("SELECT id, reference, description, unit FROM products WHERE id = ?")
    .get(productId) as Product | undefined;
  if (!product) return null;

  const recipe = db
    .prepare(
      `
      SELECT
        p2.id as inputId,
        p2.reference as inputReference,
        p2.description as inputDescription,
        p2.unit as inputUnit,
        p2.cost as inputCost,
        r.quantity as quantity
      FROM product_recipes r
      JOIN products p2 ON p2.id = r.input_product_id
      WHERE r.product_id = ?
      ORDER BY CAST(p2.reference AS INTEGER) ASC, p2.reference ASC
    `
    )
    .all(productId) as RecipeRow[];

  const inputs = db
    .prepare(
      `
      SELECT id, reference, description, unit
      FROM products
      WHERE id != ? AND unit = 'KG'
      ORDER BY CAST(reference AS INTEGER) ASC, reference ASC
    `
    )
    .all(productId) as InputProductOpt[];

  return { product, recipe, inputs };
}

export default async function ReceitaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = getData(id);
  if (!data) notFound();

  const { product, recipe, inputs } = data;
  const totalCost = recipe.reduce(
    (acc, r) => acc + Number(r.quantity) * Number(r.inputCost ?? 0),
    0
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-sm text-[var(--muted)]">Composição / Receita</div>
          <h1 className="text-2xl font-semibold">
            {product.reference} · {product.description}
          </h1>
          <div className="text-sm text-[var(--muted)]">Unidade do produto: {product.unit}</div>
        </div>
        <Link href="/estoque" className="rounded-xl border bg-[var(--card)] px-4 py-3 text-sm font-semibold">
          Voltar ao estoque
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
          <div className="text-sm font-semibold">Adicionar/editar insumo</div>
          <div className="mt-1 text-sm text-[var(--muted)]">
            Define a quantidade do insumo necessária para produzir 1 unidade deste produto.
          </div>

          <form action={addRecipeItemAction} className="mt-4 space-y-3">
            <input type="hidden" name="productId" value={product.id} />
            <label className="block space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Insumo
              </div>
              <InputSelectClient options={inputs} inputName="inputProductId" />
            </label>

            <label className="block space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Quantidade
              </div>
              <input
                name="quantity"
                type="number"
                min="0"
                step="0.001"
                className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
                placeholder="Ex.: 0.250"
                required
              />
            </label>

            <button className="rounded-xl bg-[var(--k2-red-2)] px-4 py-3 text-sm font-semibold text-white">
              Salvar insumo
            </button>
          </form>
        </div>

        <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Receita atual</div>
            <div className="text-sm text-[var(--muted)]">
              {recipe.length} itens · custo estimado:{" "}
              <span className="font-semibold text-[var(--foreground)]">
                R$ {totalCost.toFixed(4)}
              </span>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border">
            <table className="w-full text-sm">
              <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">Ref.</th>
                  <th className="px-4 py-3">Insumo</th>
                  <th className="px-4 py-3 text-right">Qtd</th>
                  <th className="px-4 py-3 text-right">Custo</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {recipe.map((r) => (
                  <tr key={r.inputId} className="border-t">
                    <td className="px-4 py-3 font-medium">{r.inputReference}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{r.inputDescription}</div>
                      <div className="text-xs text-[var(--muted)]">{r.inputUnit}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{Number(r.quantity).toFixed(3)}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      R$ {(Number(r.quantity) * Number(r.inputCost ?? 0)).toFixed(4)}
                    </td>
                    <td className="px-4 py-3">
                      <form action={removeRecipeItemAction}>
                        <input type="hidden" name="productId" value={product.id} />
                        <input type="hidden" name="inputProductId" value={r.inputId} />
                        <button className="text-xs font-semibold text-[var(--k2-red-2)]">
                          Remover
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {recipe.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-[var(--muted)]" colSpan={5}>
                      Nenhum insumo na receita ainda.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
