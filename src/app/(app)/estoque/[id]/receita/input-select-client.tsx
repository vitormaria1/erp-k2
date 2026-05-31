"use client";

import * as React from "react";

export type InputProductOpt = {
  id: string;
  reference: string;
  description: string;
  unit: string;
};

function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function InputSelectClient({
  options,
  inputName = "inputProductId",
  placeholder = "Buscar insumo por descrição ou referência...",
}: {
  options: InputProductOpt[];
  inputName?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState("");

  const map = React.useMemo(() => {
    const m = new Map<string, InputProductOpt>();
    for (const o of options) m.set(o.id, o);
    return m;
  }, [options]);

  const filtered = React.useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return options.slice(0, 60);
    const out: InputProductOpt[] = [];
    for (const o of options) {
      const hay = normalize([o.reference, o.description].join(" "));
      if (hay.includes(q)) out.push(o);
      if (out.length >= 60) break;
    }
    return out;
  }, [options, query]);

  const selected = selectedId ? map.get(selectedId) ?? null : null;

  function select(o: InputProductOpt) {
    setSelectedId(o.id);
    setQuery(`${o.reference} · ${o.description} (${o.unit})`);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input type="hidden" name={inputName} value={selectedId} />
      <input
        className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedId("");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        required
      />

      {open ? (
        <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-2xl border bg-[var(--card)] shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-[var(--muted)]">Nenhum insumo encontrado.</div>
          ) : (
            <ul className="py-2">
              {filtered.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => select(o)}
                    className="w-full px-4 py-3 text-left text-sm hover:bg-black/[0.03]"
                  >
                    <div className="font-semibold">
                      {o.reference} · {o.description}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--muted)]">{o.unit}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {selected ? (
        <div className="mt-2 text-xs text-[var(--muted)]">
          Selecionado:{" "}
          <span className="font-semibold text-[var(--foreground)]">
            {selected.reference} · {selected.description}
          </span>
        </div>
      ) : null}
    </div>
  );
}

