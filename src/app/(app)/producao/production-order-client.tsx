"use client";

import * as React from "react";

import type { ProductOpt } from "./types";

function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export type DraftItem = { productId: string; quantity: number };

export function ProductionOrderClient({ products }: { products: ProductOpt[] }) {
  const [items, setItems] = React.useState<DraftItem[]>([]);
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");

  const productMap = React.useMemo(() => {
    const m = new Map<string, ProductOpt>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const filtered = React.useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return products.slice(0, 60);
    const out: ProductOpt[] = [];
    for (const p of products) {
      const hay = normalize([p.reference, p.description].join(" "));
      if (hay.includes(q)) out.push(p);
      if (out.length >= 60) break;
    }
    return out;
  }, [products, query]);

  function select(p: ProductOpt) {
    setSelectedId(p.id);
    setQuery(`${p.reference} · ${p.description} (${p.unit})`);
    setOpen(false);
  }

  function addItem() {
    if (!selectedId) return;
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return;
    setItems((prev) => [...prev, { productId: selectedId, quantity: qty }]);
    setSelectedId("");
    setQuery("");
    setQuantity("1");
  }

  function removeAt(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="mt-4 space-y-3">
      <input type="hidden" name="itemsJson" value={JSON.stringify(items)} />

      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <div className="relative md:col-span-3">
          <input type="hidden" value={selectedId} />
          <input
            className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
            placeholder="Buscar produto por descrição ou referência..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedId("");
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          />
          {open ? (
            <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-2xl border bg-[var(--card)] shadow-lg">
              {filtered.length === 0 ? (
                <div className="px-4 py-3 text-sm text-[var(--muted)]">
                  Nenhum produto encontrado.
                </div>
              ) : (
                <ul className="py-2">
                  {filtered.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => select(p)}
                        className="w-full px-4 py-3 text-left text-sm hover:bg-black/[0.03]"
                      >
                        <div className="font-semibold">
                          {p.reference} · {p.description}
                        </div>
                        <div className="mt-0.5 text-xs text-[var(--muted)]">{p.unit}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        <input
          className="rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
          type="number"
          min="0"
          step="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Qtd"
        />
      </div>

      <button
        type="button"
        onClick={addItem}
        className="rounded-xl border bg-black px-4 py-2 text-sm font-semibold text-white"
      >
        Adicionar
      </button>

      <div className="overflow-hidden rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3 text-right">Qtd</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const p = productMap.get(it.productId);
              return (
                <tr key={`${it.productId}-${idx}`} className="border-t">
                  <td className="px-4 py-3">
                    {p ? (
                      <>
                        <div className="font-semibold">
                          {p.reference} · {p.description}
                        </div>
                        <div className="text-xs text-[var(--muted)]">{p.unit}</div>
                      </>
                    ) : (
                      it.productId
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{it.quantity}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-xs font-semibold text-[var(--k2-red-2)]"
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
                <td className="px-4 py-8 text-[var(--muted)]" colSpan={3}>
                  Nenhum produto adicionado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

