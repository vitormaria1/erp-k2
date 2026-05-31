"use client";

import * as React from "react";

import { addRouteEntryAction } from "./actions";

export type CustomerOpt = {
  id: string;
  name: string;
  tradeName: string | null;
  code: string;
};

type DayKey = 1 | 2 | 3 | 4 | 5;

function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function dayLabel(day: DayKey) {
  switch (day) {
    case 1:
      return "Segunda";
    case 2:
      return "Terça";
    case 3:
      return "Quarta";
    case 4:
      return "Quinta";
    case 5:
      return "Sexta";
  }
}

export function RotasBoardClient({
  weekStart,
  customers,
  addPlaceholder = "Buscar cliente (nome fantasia ou razão social)...",
}: {
  weekStart: string;
  customers: CustomerOpt[];
  addPlaceholder?: string;
}) {
  const [queryByDay, setQueryByDay] = React.useState<Record<string, string>>({});
  const [openDay, setOpenDay] = React.useState<DayKey | null>(null);
  const [selectedByDay, setSelectedByDay] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();

  const customersById = React.useMemo(() => {
    const map = new Map<string, CustomerOpt>();
    for (const c of customers) map.set(c.id, c);
    return map;
  }, [customers]);

  function getQuery(day: DayKey) {
    return queryByDay[String(day)] ?? "";
  }

  function setQuery(day: DayKey, value: string) {
    setQueryByDay((p) => ({ ...p, [String(day)]: value }));
  }

  function setSelected(day: DayKey, id: string) {
    setSelectedByDay((p) => ({ ...p, [String(day)]: id }));
  }

  const filteredByDay = React.useMemo(() => {
    const out: Record<string, CustomerOpt[]> = {};
    for (const day of [1, 2, 3, 4, 5] as DayKey[]) {
      const q = normalize(getQuery(day).trim());
      if (!q) {
        out[String(day)] = customers.slice(0, 60);
        continue;
      }
      const matches: CustomerOpt[] = [];
      for (const c of customers) {
        const hay = normalize([c.tradeName ?? "", c.name, c.code].join(" "));
        if (hay.includes(q)) matches.push(c);
        if (matches.length >= 60) break;
      }
      out[String(day)] = matches;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, queryByDay]);

  function pick(day: DayKey, c: CustomerOpt) {
    setSelected(day, c.id);
    setQuery(day, c.tradeName ? `${c.tradeName} (${c.code})` : `${c.name} (${c.code})`);
    setOpenDay(null);
  }

  function submit(day: DayKey) {
    const customerId = selectedByDay[String(day)];
    if (!customerId) return;
    const fd = new FormData();
    fd.set("weekStart", weekStart);
    fd.set("weekday", String(day));
    fd.set("customerId", customerId);
    startTransition(async () => {
      await addRouteEntryAction(fd);
      // refresh page data
      window.location.reload();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {([1, 2, 3, 4, 5] as DayKey[]).map((day) => {
        const selected = selectedByDay[String(day)] ? customersById.get(selectedByDay[String(day)]) ?? null : null;
        const options = filteredByDay[String(day)] ?? [];
        return (
          <div key={day} className="rounded-2xl border bg-[var(--card)] shadow-sm">
            <div className="border-b px-4 py-3">
              <div className="text-sm font-semibold">{dayLabel(day)}</div>
              <div className="text-xs text-[var(--muted)]">Adicionar entregas do dia</div>
            </div>

            <div className="p-4">
              <div className="relative">
                <input
                  className="w-full rounded-xl border bg-[var(--card)] px-3 py-2 text-sm"
                  placeholder={addPlaceholder}
                  value={getQuery(day)}
                  onChange={(e) => {
                    setQuery(day, e.target.value);
                    setSelected(day, "");
                    setOpenDay(day);
                  }}
                  onFocus={() => setOpenDay(day)}
                  onBlur={() => window.setTimeout(() => setOpenDay((d) => (d === day ? null : d)), 150)}
                />
                {openDay === day ? (
                  <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-2xl border bg-[var(--card)] shadow-lg">
                    {options.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-[var(--muted)]">Nenhum cliente encontrado.</div>
                    ) : (
                      <ul className="py-2">
                        {options.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => pick(day, c)}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-black/[0.03]"
                            >
                              <div className="font-semibold">{c.tradeName ? c.tradeName : c.name}</div>
                              <div className="mt-0.5 text-xs text-[var(--muted)]">{c.tradeName ? c.name : c.code}</div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>

              {selected ? (
                <div className="mt-2 text-xs text-[var(--muted)]">
                  Selecionado:{" "}
                  <span className="font-semibold text-[var(--foreground)]">
                    {selected.tradeName ? selected.tradeName : selected.name}
                  </span>
                </div>
              ) : null}

              <button
                type="button"
                disabled={pending || !selectedByDay[String(day)]}
                onClick={() => submit(day)}
                className="mt-3 w-full rounded-xl bg-black px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Adicionar
              </button>

              <div className="mt-3 text-xs text-[var(--muted)]">
                Dica: depois de adicionar, ajuste status e ordem na lista abaixo.
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

