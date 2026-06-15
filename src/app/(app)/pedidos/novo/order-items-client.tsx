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
type LastPriceState =
  | { status: "idle"; unitPrice: null }
  | { status: "loading"; unitPrice: null }
  | { status: "ready"; unitPrice: number | null };

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

export function OrderItemsClient({
  products,
  formId,
  initialItems = [],
}: {
  products: ProductOpt[];
  formId: string;
  initialItems?: DraftItem[];
}) {
  const [items, setItems] = React.useState<DraftItem[]>(initialItems);
  const [itemQuantityDrafts, setItemQuantityDrafts] = React.useState<string[]>(() =>
    initialItems.map((item) => item.quantity.toString())
  );
  const [itemPriceDrafts, setItemPriceDrafts] = React.useState<string[]>(() =>
    initialItems.map((item) => (typeof item.unitPrice === "number" ? item.unitPrice.toString() : ""))
  );
  const [customerId, setCustomerId] = React.useState("");
  const [productId, setProductId] = React.useState("");
  const [productQuery, setProductQuery] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [unitPrice, setUnitPrice] = React.useState("");
  const [lastPrice, setLastPrice] = React.useState<LastPriceState>({ status: "idle", unitPrice: null });
  const deferredQuery = React.useDeferredValue(productQuery);
  const priceInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    form.dispatchEvent(
      new CustomEvent("order-items-change", {
        bubbles: true,
        detail: { itemsCount: items.length },
      })
    );
  }, [formId, items]);

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

  function handleQuantityEditorKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    priceInputRef.current?.focus();
    priceInputRef.current?.select();
  }

  function handlePriceEditorKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (selectedProduct) addItem();
  }

  function addItem() {
    if (!productId) return;
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const price = unitPrice.trim().length ? Number(unitPrice) : undefined;
    if (typeof price === "number" && (!Number.isFinite(price) || price < 0)) return;
    setItems((prev) => [...prev, { productId, quantity: qty, unitPrice: price }]);
    setItemQuantityDrafts((prev) => [...prev, qty.toString()]);
    setItemPriceDrafts((prev) => [...prev, typeof price === "number" ? price.toString() : ""]);
    setProductId("");
    setQuantity("1");
    setUnitPrice("");
  }

  function removeAt(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setItemQuantityDrafts((prev) => prev.filter((_, i) => i !== idx));
    setItemPriceDrafts((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateQuantityAt(idx: number, nextValue: string) {
    setItemQuantityDrafts((prev) => prev.map((value, itemIdx) => (itemIdx === idx ? nextValue : value)));

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

  function finalizeQuantityAt(idx: number) {
    setItemQuantityDrafts((prev) =>
      prev.map((value, itemIdx) => {
        if (itemIdx !== idx) return value;
        const trimmed = value.trim();
        if (!trimmed.length) return items[idx]?.quantity.toString() ?? "1";
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed <= 0) return items[idx]?.quantity.toString() ?? "1";
        return parsed.toString();
      })
    );
  }

  function updatePriceAt(idx: number, nextValue: string) {
    setItemPriceDrafts((prev) => prev.map((value, itemIdx) => (itemIdx === idx ? nextValue : value)));

    if (!nextValue.trim().length) {
      setItems((prev) =>
        prev.map((item, itemIdx) => {
          if (itemIdx !== idx) return item;
          return { ...item, unitPrice: undefined };
        })
      );
      return;
    }

    const nextPrice = Number(nextValue);
    if (!Number.isFinite(nextPrice) || nextPrice < 0) return;
    setItems((prev) =>
      prev.map((item, itemIdx) => {
        if (itemIdx !== idx) return item;
        return { ...item, unitPrice: nextPrice };
      })
    );
  }

  function finalizePriceAt(idx: number) {
    setItemPriceDrafts((prev) =>
      prev.map((value, itemIdx) => {
        if (itemIdx !== idx) return value;
        const trimmed = value.trim();
        if (!trimmed.length) return "";
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed < 0) {
          const current = items[idx]?.unitPrice;
          return typeof current === "number" ? current.toString() : "";
        }
        return parsed.toString();
      })
    );
  }

  React.useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;

    const syncCustomerId = () => {
      const input = form.elements.namedItem("customerId");
      if (!(input instanceof HTMLInputElement)) {
        setCustomerId("");
        return;
      }
      setCustomerId(input.value);
    };

    const handleCustomerChange = () => syncCustomerId();

    const handleReset = () => {
      setItems(initialItems);
      setItemQuantityDrafts(initialItems.map((item) => item.quantity.toString()));
      setItemPriceDrafts(initialItems.map((item) => (typeof item.unitPrice === "number" ? item.unitPrice.toString() : "")));
      setCustomerId("");
      setProductId("");
      setProductQuery("");
      setQuantity("1");
      setUnitPrice("");
      setLastPrice({ status: "idle", unitPrice: null });
    };

    syncCustomerId();
    form.addEventListener("customer-selection-change", handleCustomerChange as EventListener);
    form.addEventListener("reset", handleReset);
    return () => {
      form.removeEventListener("customer-selection-change", handleCustomerChange as EventListener);
      form.removeEventListener("reset", handleReset);
    };
  }, [formId, initialItems]);

  React.useEffect(() => {
    if (!customerId || !productId) {
      setLastPrice({ status: "idle", unitPrice: null });
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ customerId, productId });
    setLastPrice({ status: "loading", unitPrice: null });

    void fetch(`/api/orders/last-price?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as { unitPrice?: number | null };
        return typeof payload.unitPrice === "number" && Number.isFinite(payload.unitPrice)
          ? payload.unitPrice
          : null;
      })
      .then((nextUnitPrice) => {
        setLastPrice({ status: "ready", unitPrice: nextUnitPrice });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Falha ao buscar ultimo preco do cliente", error);
        setLastPrice({ status: "ready", unitPrice: null });
      });

    return () => controller.abort();
  }, [customerId, productId]);

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
                      value={itemQuantityDrafts[idx] ?? it.quantity.toString()}
                      onChange={(e) => updateQuantityAt(idx, e.target.value)}
                      onBlur={() => finalizeQuantityAt(idx)}
                      aria-label={`Quantidade do item ${p?.description ?? it.productId}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="w-28 rounded-lg border bg-[var(--card)] px-2 py-1.5 text-sm"
                      type="number"
                      min="0"
                      step="0.01"
                      value={itemPriceDrafts[idx] ?? (typeof it.unitPrice === "number" ? it.unitPrice.toString() : "")}
                      onChange={(e) => updatePriceAt(idx, e.target.value)}
                      onBlur={() => finalizePriceAt(idx)}
                      aria-label={`Preço do item ${p?.description ?? it.productId}`}
                      placeholder="0.00"
                    />
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
        <div className="text-sm text-[var(--muted)]">Total atual do orçamento</div>
        <div className="text-lg font-semibold">R$ {orderTotal.toFixed(2)}</div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
        <div className="rounded-2xl border bg-black/[0.015] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Produtos</div>
              <div className="text-xs text-[var(--muted)]">
                Digite por nome, c&oacute;digo ou refer&ecirc;ncia. Apenas itens do tipo PRODUTO aparecem aqui.
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
                onKeyDown={handleQuantityEditorKeyDown}
                placeholder="Qtd"
              />
            </label>
            <label className="space-y-1">
              <div className="text-xs font-semibold text-[var(--muted)]">Pre&ccedil;o unit&aacute;rio</div>
              <input
                ref={priceInputRef}
                className="w-full rounded-xl border bg-[var(--card)] px-3 py-2 text-sm"
                type="number"
                min="0"
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                onKeyDown={handlePriceEditorKeyDown}
                placeholder="R$ 0,00"
              />
              {selectedProduct && customerId ? (
                <div className="text-[10px] leading-tight text-[var(--muted)]">
                  {lastPrice.status === "loading"
                    ? "Carregando..."
                    : lastPrice.unitPrice == null
                      ? "Sem hist\u00f3rico"
                      : `\u00daltimo: R$ ${lastPrice.unitPrice.toFixed(2)}`}
                </div>
              ) : null}
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
