"use client";

import * as React from "react";

export type ProductOpt = { id: string; description: string; reference: string; unit: string };
export type DraftItem = { productId: string; quantity: number; unitPrice?: number };

function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function OrderItemsClient({ products }: { products: ProductOpt[] }) {
  const [items, setItems] = React.useState<DraftItem[]>([]);
  const [productId, setProductId] = React.useState("");
  const [productQuery, setProductQuery] = React.useState("");
  const [productOpen, setProductOpen] = React.useState(false);
  const [quantity, setQuantity] = React.useState("1");
  const [unitPrice, setUnitPrice] = React.useState("");

  const productMap = React.useMemo(() => {
    const map = new Map<string, ProductOpt>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  const filteredProducts = React.useMemo(() => {
    const q = normalize(productQuery.trim());
    if (!q) return products.slice(0, 60);
    const out: ProductOpt[] = [];
    for (const p of products) {
      const hay = normalize([p.description, p.reference].join(" "));
      if (hay.includes(q)) out.push(p);
      if (out.length >= 60) break;
    }
    return out;
  }, [products, productQuery]);

  const selectedProduct = React.useMemo(() => {
    if (!productId) return null;
    return productMap.get(productId) ?? null;
  }, [productId, productMap]);

  function selectProduct(p: ProductOpt) {
    setProductId(p.id);
    setProductQuery(`${p.description} (${p.reference})`);
    setProductOpen(false);
  }

  function addItem() {
    if (!productId) return;
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const price = unitPrice.trim().length ? Number(unitPrice) : undefined;
    setItems((prev) => [...prev, { productId, quantity: qty, unitPrice: price }]);
    setProductId("");
    setProductQuery("");
    setQuantity("1");
    setUnitPrice("");
  }

  function removeAt(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="mt-3 space-y-3">
      <input type="hidden" name="itemsJson" value={JSON.stringify(items)} />

      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <div className="relative md:col-span-2">
          <input type="hidden" value={productId} />
          <input
            className="w-full rounded-xl border bg-[var(--card)] px-3 py-2 text-sm"
            placeholder="Buscar item por descrição ou referência..."
            value={productQuery}
            onChange={(e) => {
              setProductQuery(e.target.value);
              setProductOpen(true);
              setProductId("");
            }}
            onFocus={() => setProductOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setProductOpen(false), 150);
            }}
            aria-label="Buscar item"
          />
          {productOpen ? (
            <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-2xl border bg-[var(--card)] shadow-lg">
              {filteredProducts.length === 0 ? (
                <div className="px-3 py-2 text-sm text-[var(--muted)]">
                  Nenhum item encontrado.
                </div>
              ) : (
                <ul className="py-2">
                  {filteredProducts.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectProduct(p)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-black/[0.03]"
                      >
                        <div className="font-semibold">{p.description}</div>
                        <div className="mt-0.5 text-xs text-[var(--muted)]">
                          {p.reference} · {p.unit}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          {selectedProduct ? (
            <div className="mt-2 text-xs text-[var(--muted)]">
              Selecionado:{" "}
              <span className="font-semibold text-[var(--foreground)]">
                {selectedProduct.description} ({selectedProduct.reference})
              </span>
            </div>
          ) : null}
        </div>
        <input
          className="rounded-xl border bg-[var(--card)] px-3 py-2 text-sm"
          type="number"
          min="0"
          step="0.001"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Qtd"
        />
        <input
          className="rounded-xl border bg-[var(--card)] px-3 py-2 text-sm"
          type="number"
          min="0"
          step="0.01"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          placeholder="Preço (R$)"
        />
      </div>
      <button
        type="button"
        onClick={addItem}
        className="rounded-xl border bg-black px-4 py-2 text-sm font-semibold text-white"
      >
        Adicionar
      </button>

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2">Qtd</th>
              <th className="px-3 py-2">Preço</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const p = productMap.get(it.productId);
              return (
                <tr key={`${it.productId}-${idx}`} className="border-t">
                  <td className="px-3 py-2">
                    {p ? (
                      <>
                        <div className="font-semibold">{p.description}</div>
                        <div className="text-xs text-[var(--muted)]">
                          {p.reference} · {p.unit}
                        </div>
                      </>
                    ) : (
                      it.productId
                    )}
                  </td>
                  <td className="px-3 py-2">{it.quantity}</td>
                  <td className="px-3 py-2">
                    {typeof it.unitPrice === "number" ? it.unitPrice.toFixed(2) : "-"}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-sm text-[var(--k2-red-2)]"
                      onClick={() => removeAt(idx)}
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-[var(--muted)]" colSpan={4}>
                  Nenhum item adicionado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
