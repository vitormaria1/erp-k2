"use client";

import * as React from "react";

import type { ProductColumnConfig } from "@/lib/product-columns";
import type { ProductRecord } from "@/lib/queries";

const STORAGE_KEY = "erp-k2.stock-table.columns";
const MIN_COLUMN_WIDTH = 80;

type ResizeState = {
  key: string;
  startX: number;
  startWidth: number;
};

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
  const [resize, setResize] = React.useState<ResizeState | null>(null);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // noop
    }
  }, [settings]);

  React.useEffect(() => {
    if (!resize) return;
    const activeResize = resize;

    function onMove(event: PointerEvent) {
      setSettings((current) =>
        current.map((column) => {
          if (column.key !== activeResize.key) return column;
          const nextWidth = Math.max(
            MIN_COLUMN_WIDTH,
            activeResize.startWidth + (event.clientX - activeResize.startX)
          );
          return { ...column, width: nextWidth };
        })
      );
    }

    function onUp() {
      setResize(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [resize]);

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

  function resetDefaults() {
    setSettings(columns);
  }

  return (
    <div className="mt-5 flex flex-col gap-4">
      <details className="rounded-2xl border bg-[var(--card)] shadow-sm">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
          Configurar colunas
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
                onClick={resetDefaults}
              >
                Restaurar padrão
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-xl border">
            <div className="border-b bg-black/[0.02] px-4 py-3 text-xs text-[var(--muted)]">
              As larguras são ajustadas diretamente arrastando a borda das colunas na tabela.
            </div>
            <div className="max-h-[360px] overflow-auto">
              <div className="grid min-w-[700px] grid-cols-[1fr_100px] gap-3 border-b bg-black/[0.02] px-4 py-3 text-xs font-semibold text-[var(--muted)]">
                <div>Coluna</div>
                <div>Visível</div>
              </div>
              <div className="divide-y">
                {filteredSettings.map((column) => (
                  <div
                    key={column.key}
                    className="grid min-w-[700px] grid-cols-[1fr_100px] items-center gap-3 px-4 py-3"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{column.label}</span>
                      <span className="text-xs text-[var(--muted)]">{column.key}</span>
                    </div>
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
        </div>
      </details>

      <div className="overflow-x-auto rounded-2xl border bg-[var(--card)] shadow-sm">
        <table className="w-full min-w-[1600px] table-fixed text-sm">
          <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
            <tr>
              {visibleColumns.map((column) => (
                <th
                  key={column.key}
                  className="relative px-4 py-3 align-top"
                  style={{ width: `${column.width}px`, minWidth: `${column.width}px` }}
                >
                  <div className="pr-3">{column.label}</div>
                  <button
                    type="button"
                    aria-label={`Redimensionar coluna ${column.label}`}
                    title="Arraste para redimensionar"
                    className="absolute right-0 top-0 h-full w-3 cursor-col-resize touch-none select-none"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      setResize({
                        key: column.key,
                        startX: event.clientX,
                        startWidth: column.width,
                      });
                    }}
                  >
                    <span className="absolute right-1 top-1/2 h-6 w-px -translate-y-1/2 bg-black/15" />
                    <span className="absolute right-0 top-0 h-full w-px bg-black/5" />
                  </button>
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
