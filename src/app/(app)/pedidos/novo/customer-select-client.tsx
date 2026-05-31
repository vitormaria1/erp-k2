"use client";

import * as React from "react";

export type CustomerOpt = {
  id: string;
  name: string;
  tradeName: string | null;
  code: string;
  cnpj: string | null;
};

function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function CustomerSelectClient({
  customers,
  inputName = "customerId",
}: {
  customers: CustomerOpt[];
  inputName?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return customers.slice(0, 50);
    const out: CustomerOpt[] = [];
    for (const c of customers) {
      const hay = normalize(
        [c.name, c.tradeName ?? "", c.code, c.cnpj ?? ""].filter(Boolean).join(" ")
      );
      if (hay.includes(q)) out.push(c);
      if (out.length >= 50) break;
    }
    return out;
  }, [customers, query]);

  const selected = React.useMemo(
    () => customers.find((c) => c.id === selectedId) ?? null,
    [customers, selectedId]
  );

  function select(c: CustomerOpt) {
    setSelectedId(c.id);
    setQuery(`${c.name}${c.tradeName ? ` (${c.tradeName})` : ""}`);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input type="hidden" name={inputName} value={selectedId} />
      <input
        className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
        placeholder="Buscar cliente por nome, fantasia, CNPJ ou código..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setSelectedId("");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
        }}
        aria-label="Buscar cliente"
        required
      />

      {open ? (
        <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-2xl border bg-[var(--card)] shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-[var(--muted)]">Nenhum cliente encontrado.</div>
          ) : (
            <ul className="py-2">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => select(c)}
                    className="w-full px-4 py-3 text-left text-sm hover:bg-black/[0.03]"
                  >
                    <div className="font-semibold">
                      {c.tradeName ? c.tradeName : c.name}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--muted)]">
                      {c.name}
                      {" · "}
                      {c.code}
                      {c.cnpj ? ` · ${c.cnpj}` : ""}
                    </div>
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
            {selected.tradeName ? `${selected.tradeName} (${selected.name})` : selected.name}
          </span>
        </div>
      ) : null}
    </div>
  );
}

