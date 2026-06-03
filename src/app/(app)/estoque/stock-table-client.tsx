"use client";

import * as React from "react";

import type { ProductColumnConfig } from "@/lib/product-columns";
import type { ProductRecord } from "@/lib/queries";

const STORAGE_KEY = "erp-k2.stock-table.columns";

function loadSettings(columns: ProductColumnConfig[]) {
  if (typeof window === "undefined") return columns;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return columns;
    const saved = JSON.parse(raw) as ProductColumnConfig[];
    const map = new Map(saved.map((column) => [column.key, column]));
    return columns.map((column) => map.get(column.key) ?? column);
  } catch {
    return columns;
  }
}

function formatValue(column: ProductColumnConfig, row: ProductRecord) {
  const value = row[column.key];
  if (value === null || value === undefined || value === "") return "-";
  if (column.kind === "money") {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue.toFixed(4) : String(value);
  }
  if (column.kind === "number") {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue.toFixed(3) : String(value);
  }
  return String(value);
}

export function StockTableClient({
  rows,
  columns,
}: {
  rows: ProductRecord[];
  columns: ProductColumnConfig[];
}) {
  const [settings, setSettings] = React.useState<ProductColumnConfig[]>(() => loadSettings(columns));
  const [filter, setFilter] = React.useState("");

  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // noop
    }
  }, [settings]);

  const visibleColumns = React.useMemo(() => settings.filter((column) => column.visible), [settings]);
  const filteredSettings = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return settings;
    return settings.filter(
      (column) =>
        column.label.toLowerCase().includes(q) || column.key.toLowerCase().includes(q)
    );
  }, [settings, filter]);

  function updateColumn(key: string, patch: Partial<ProductColumnConfig>) {
    setSettings((current) =>
      current.map((column) => (column.key === key ? { ...column, ...patch } : column))
    );
  }

  function setAllVisible(visible: boolean) {
    setSettings((current) => current.map((column) => ({ ...column, visible })));
  }

  return (
    <div className="mt-5 flex flex-col gap-4">
      <details className="rounded-2xl border bg-[var(--card)] shadow-sm">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
          Configurar colunas e larguras
        </summary>
        <div className="border-t px-4 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filtrar coluna..."
              className="w-full rounded-xl border px-4 py-2 text-sm md:max-w-md"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl border px-3 py-2 text-sm font-semibold"
                onClick={() => setAllVisible(true)}
              >
                Mostrar todas
              </button>
              <button
                type="button"
                className="rounded-xl border px-3 py-2 text-sm font-semibold"
                onClick={() => setAllVisible(false)}
              >
                Ocultar todas
              </button>
              <button
                type="button"
                className="rounded-xl border px-3 py-2 text-sm font-semibold"
                onClick={() => setSettings(columns)}
              >
                Restaurar padrão
              </button>
            </div>
          </div>

          <div className="mt-4 max-h-[360px] overflow-auto rounded-xl border">
            <div className="grid min-w-[700px] grid-cols-[1fr_90px_100px] gap-2 border-b bg-black/[0.02] px-4 py-3 text-xs font-semibold text-[var(--muted)]">
              <div>Coluna</div>
              <div>Largura</div>
              <div>Visível</div>
            </div>
            <div className="divide-y">
              {filteredSettings.map((column) => (
                <div
                  key={column.key}
                  className="grid min-w-[700px] grid-cols-[1fr_90px_100px] items-center gap-2 px-4 py-3"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{column.label}</span>
                    <span className="text-xs text-[var(--muted)]">{column.key}</span>
                  </div>
                  <input
                    type="number"
                    min="60"
                    step="10"
                    value={column.width}
                    onChange={(event) =>
                      updateColumn(column.key, { width: Number(event.target.value) || column.width })
                    }
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={column.visible}
                      onChange={(event) =>
                        updateColumn(column.key, { visible: event.target.checked })
                      }
                    />
                    Mostrar
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </details>

      <div className="overflow-x-auto rounded-2xl border bg-[var(--card)] shadow-sm">
        <table className="min-w-[1600px] w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
            <tr>
              {visibleColumns.map((column) => (
                <th
                  key={column.key}
                  className="px-4 py-3"
                  style={{ width: `${column.width}px`, minWidth: `${column.width}px` }}
                >
                  {column.label}
                </th>
              ))}
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)} className="border-t align-top">
                {visibleColumns.map((column) => (
                  <td
                    key={column.key}
                    className="px-4 py-3 align-top"
                    style={{ width: `${column.width}px`, minWidth: `${column.width}px` }}
                  >
                    {formatValue(column, row)}
                  </td>
                ))}
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <a
                      className="rounded-xl border bg-[var(--card)] px-3 py-2 text-xs font-semibold hover:bg-black/[0.03]"
                      href={`/estoque/${row.id}/editar`}
                    >
                      Editar
                    </a>
                    <a
                      className="rounded-xl border bg-[var(--card)] px-3 py-2 text-xs font-semibold hover:bg-black/[0.03]"
                      href={`/estoque/${row.id}/receita`}
                    >
                      Receita
                    </a>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-[var(--muted)]" colSpan={visibleColumns.length + 1}>
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
