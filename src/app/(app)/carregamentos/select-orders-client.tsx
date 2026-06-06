"use client";

import * as React from "react";

import { createLoadingAction } from "@/app/(app)/carregamentos/actions";
import { formatDateTime } from "@/lib/datetime";

export type OrderRow = {
  id: number;
  createdAt: string;
  status: string;
  customerName: string;
  itemsCount: number;
};

export function SelectOrdersClient({ orders }: { orders: OrderRow[] }) {
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [notes, setNotes] = React.useState("");

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (prev.size === orders.length) return new Set();
      return new Set(orders.map((o) => o.id));
    });
  }

  return (
    <>
      <div className="mt-5 flex flex-col gap-3 rounded-2xl border bg-[var(--card)] p-4 shadow-sm md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold">Selecionar pedidos</div>
          <div className="text-sm text-[var(--muted)]">
            Marque os pedidos abaixo para montar a carga.
          </div>
        </div>
        <form action={createLoadingAction} className="flex flex-col gap-2 md:flex-row md:items-center">
          <input type="hidden" name="orderIdsJson" value={JSON.stringify(Array.from(selected))} />
          <input
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm md:w-[360px]"
            placeholder="Observações (opcional)"
          />
          <button
            className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            disabled={selected.size === 0}
          >
            Criar carregamento ({selected.size})
          </button>
        </form>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border bg-[var(--card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={orders.length > 0 && selected.size === orders.length}
                    onChange={toggleAll}
                  />
                  <span>Sel.</span>
                </label>
              </th>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Itens</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Criado em</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                </td>
                <td className="px-4 py-3 font-medium">#{o.id}</td>
                <td className="px-4 py-3">{o.customerName}</td>
                <td className="px-4 py-3">{o.itemsCount}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-black/[0.04] px-3 py-1 text-xs font-semibold">
                    {o.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">
                  {formatDateTime(o.createdAt)}
                </td>
              </tr>
            ))}
            {orders.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-[var(--muted)]" colSpan={6}>
                  Nenhum pedido ainda.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
