"use client";

import * as React from "react";

export type ProductOpt = {
  id: string;
  description: string;
  reference: string;
  unit: string;
  price: number | string | null;
  salePriceRaw?: string | null;
};
export type DraftItem = { productId: string; quantity: number; unitPrice?: number };

function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function asPrice(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\./g, "").replace(",", ".").trim();
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function productDefaultPrice(product: ProductOpt) {
  return asPrice(product.price) ?? asPrice(product.salePriceRaw);
}

export function OrderItemsClient({ products, formId }: { products: ProductOpt[]; formId: string }) {
  const [items, setItems] = React.useState<DraftItem[]>([]);
  const [productId, setProductId] = React.useState("");
  const [productQuery, setProductQuery] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [unitPrice, setUnitPrice] = React.useState("");
  const deferredQuery = React.useDeferredValue(productQuery);

  const productMap = React.useMemo(() => {
    const map = new Map<string, ProductOpt>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  const filteredProducts = React.useMemo(() => {
    const q = normalize(deferredQuery.trim());
    if (!q) return products;
    return products.filter((p) => normalize([p.description, p.reference, p.id].join(" ")).includes(q));
  }, [products, deferredQuery]);

  const selectedProduct = React.useMemo(() => {
    if (!productId) return null;
    return productMap.get(productId) ?? null;
  }, [productId, productMap]);
  const orderTotal = React.useMemo(
    () => items.reduce((acc, item) => acc + (item.unitPrice ?? 0) * item.quantity, 0),
    [items]
  );

  function selectProduct(p: ProductOpt) {
    setProductId(p.id);
    const defaultPrice = productDefaultPrice(p);
    setUnitPrice(defaultPrice == null ? "" : String(defaultPrice));
  }

  function handleEditorKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (selectedProduct) addItem();
  }

  function addItem() {
    if (!productId) return;
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const price = unitPrice.trim().length ? Number(unitPrice) : undefined;
    setItems((prev) => [...prev, { productId, quantity: qty, unitPrice: price }]);
    setProductId("");
    setQuantity("1");
    setUnitPrice("");
  }

  function removeAt(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateQuantityAt(idx: number, nextValue: string) {
    if (!nextValue.trim().length) return;
    const nextQuantity = Number(nextValue);
    if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) return;
    setItems((prev) =>
      prev.map((item, itemIdx) => {
        if (itemIdx !== idx) return item;
        return { ...item, quantity: nextQuantity };
      })
    );
  }

  React.useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;

    const handleReset = () => {
      setItems([]);
      setProductId("");
      setProductQuery("");
      setQuantity("1");
      setUnitPrice("");
    };

    form.addEventListener("reset", handleReset);
    return () => form.removeEventListener("reset", handleReset);
  }, [formId]);

  return (
    <div className="mt-3 space-y-3">
      <input type="hidden" name="itemsJson" value={JSON.stringify(items)} />

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
                  <td className="px-3 py-2">
                    <input
                      className="w-24 rounded-lg border bg-[var(--card)] px-2 py-1.5 text-sm"
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={it.quantity}
                      onChange={(e) => updateQuantityAt(idx, e.target.value)}
                      aria-label={`Quantidade do item ${p?.description ?? it.productId}`}
                    />
                  </td>
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

      <div className="flex items-center justify-between rounded-2xl border bg-black/[0.03] px-4 py-3">
        <div className="text-sm text-[var(--muted)]">Total atual do pedido</div>
        <div className="text-lg font-semibold">R$ {orderTotal.toFixed(2)}</div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
        <div className="rounded-2xl border bg-black/[0.015] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Produtos</div>
              <div className="text-xs text-[var(--muted)]">
                Digite por nome, c&oacute;digo ou refer&ecirc;ncia. A lista filtra a cada letra.
              </div>
            </div>
            <div className="text-xs text-[var(--muted)]">{filteredProducts.length} itens</div>
          </div>

          <input
            className="mt-3 w-full rounded-xl border bg-[var(--card)] px-3 py-2 text-sm"
            placeholder="Buscar item por descri&ccedil;&atilde;o, refer&ecirc;ncia ou c&oacute;digo..."
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            aria-label="Buscar item"
          />
          <div className="mt-3 max-h-80 overflow-y-auto rounded-2xl border bg-[var(--card)]">
            {filteredProducts.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-[var(--muted)]">
                Nenhum item encontrado.
              </div>
            ) : (
              <ul className="divide-y divide-black/5">
                {filteredProducts.map((p) => {
                  const isSelected = p.id === productId;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => selectProduct(p)}
                        className={`w-full px-3 py-2.5 text-left text-sm transition ${
                          isSelected ? "bg-[var(--k2-red-2)]/8" : "hover:bg-black/[0.03]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{p.description}</div>
                            <div className="mt-0.5 text-xs text-[var(--muted)]">
                              {p.reference} · {p.unit}
                              {productDefaultPrice(p) != null ? ` · R$ ${productDefaultPrice(p)!.toFixed(2)}` : ""}
                            </div>
                          </div>
                          {isSelected ? (
                            <span className="rounded-full bg-[var(--k2-red-2)] px-2 py-0.5 text-[10px] font-semibold text-white">
                              Selecionado
                            </span>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-[var(--card)] p-4">
          {selectedProduct ? (
            <div className="rounded-2xl border bg-black/[0.02] p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                Produto selecionado
              </div>
              <div className="mt-1 text-sm font-semibold">{selectedProduct.description}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                {selectedProduct.reference} · {selectedProduct.unit}
                {productDefaultPrice(selectedProduct) != null
                  ? ` · Preço padrão R$ ${productDefaultPrice(selectedProduct)!.toFixed(2)}`
                  : ""}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-4 text-sm text-[var(--muted)]">
              Selecione um produto na lista ao lado.
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <div className="text-xs font-semibold text-[var(--muted)]">Quantidade</div>
              <input
                className="w-full rounded-xl border bg-[var(--card)] px-3 py-2 text-sm"
                type="number"
                min="0"
                step="0.001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                onKeyDown={handleEditorKeyDown}
                placeholder="Qtd"
              />
            </label>
            <label className="space-y-1">
              <div className="text-xs font-semibold text-[var(--muted)]">Pre&ccedil;o unit&aacute;rio</div>
              <input
                className="w-full rounded-xl border bg-[var(--card)] px-3 py-2 text-sm"
                type="number"
                min="0"
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                onKeyDown={handleEditorKeyDown}
                placeholder="R$ 0,00"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={addItem}
            disabled={!selectedProduct}
            className="mt-4 w-full rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Adicionar item
          </button>
        </div>
      </div>
    </div>
  );
}
