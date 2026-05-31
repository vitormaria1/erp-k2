import { getDb } from "@/lib/db";
import { RotasBoardClient, type CustomerOpt } from "./rotas-board-client";
import { moveRouteEntryAction, removeRouteEntryAction, updateRouteEntryAction } from "./actions";

type EntryRow = {
  id: string;
  weekday: number;
  sortOrder: number;
  status: "NONE" | "MESSAGE_SENT" | "ORDER_PLACED";
  notes: string | null;
  customerId: string;
  customerName: string;
  customerTradeName: string | null;
  customerCode: string;
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfWeekMondayIso(date = new Date()) {
  // Monday=1 ... Sunday=0
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0..6
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return isoDate(d);
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function getWeek(weekStart: string) {
  const db = getDb();
  const week = db
    .prepare("SELECT id, week_start as weekStart FROM route_weeks WHERE week_start = ?")
    .get(weekStart) as { id: string; weekStart: string } | undefined;

  const entries: EntryRow[] = week
    ? (db
        .prepare(
          `
          SELECT
            re.id as id,
            re.weekday as weekday,
            re.sort_order as sortOrder,
            re.status as status,
            re.notes as notes,
            c.id as customerId,
            c.name as customerName,
            c.trade_name as customerTradeName,
            c.code as customerCode
          FROM route_entries re
          JOIN customers c ON c.id = re.customer_id
          WHERE re.route_week_id = ?
          ORDER BY re.weekday ASC, re.sort_order ASC
        `
        )
        .all(week.id) as EntryRow[])
    : [];

  return { weekId: week?.id ?? null, entries };
}

function listCustomersForRoutes(): CustomerOpt[] {
  const db = getDb();
  return db
    .prepare("SELECT id, name, trade_name as tradeName, code FROM customers ORDER BY name")
    .all() as CustomerOpt[];
}

function statusLabel(s: EntryRow["status"]) {
  if (s === "MESSAGE_SENT") return "Mensagem enviada";
  if (s === "ORDER_PLACED") return "Pedido feito";
  return "Sem status";
}

function statusClasses(s: EntryRow["status"]) {
  if (s === "ORDER_PLACED") return "bg-emerald-500/15 text-emerald-800";
  if (s === "MESSAGE_SENT") return "bg-sky-500/15 text-sky-800";
  return "bg-black/[0.04] text-[var(--muted)]";
}

export default async function RotasPage(props: { searchParams?: Promise<{ week?: string }> }) {
  const sp = (await props.searchParams) ?? {};
  const currentWeek = startOfWeekMondayIso();
  const weekStart = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : currentWeek;
  const { entries } = getWeek(weekStart);
  const customers = listCustomersForRoutes();

  const byDay = new Map<number, EntryRow[]>();
  for (const e of entries) {
    byDay.set(e.weekday, [...(byDay.get(e.weekday) ?? []), e]);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Rotas</h1>
          <div className="text-sm text-[var(--muted)]">
            Organize entregas e acompanhe status por dia (Seg–Sex).
          </div>
        </div>

        <form action="/rotas" method="GET" className="flex flex-wrap items-end gap-2">
          <label className="block space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Semana (segunda)
            </div>
            <input
              name="week"
              type="date"
              defaultValue={weekStart}
              className="rounded-xl border bg-[var(--card)] px-3 py-2 text-sm"
            />
          </label>
          <button className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white">
            Abrir
          </button>
          <a
            className="rounded-xl border bg-[var(--card)] px-4 py-2 text-sm font-semibold"
            href={`/rotas?week=${addDaysIso(weekStart, -7)}`}
          >
            ← Semana anterior
          </a>
          <a
            className="rounded-xl border bg-[var(--card)] px-4 py-2 text-sm font-semibold"
            href={`/rotas?week=${addDaysIso(weekStart, 7)}`}
          >
            Próxima semana →
          </a>
        </form>
      </div>

      <div className="mt-6">
        <RotasBoardClient weekStart={weekStart} customers={customers} />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border bg-[var(--card)] shadow-sm">
        <div className="border-b px-5 py-4">
          <div className="text-sm font-semibold">Lista da semana</div>
          <div className="text-sm text-[var(--muted)]">
            Itens editáveis por coluna (status, observação e ordem).
          </div>
        </div>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-5">
          {[
            { day: 1, label: "Segunda" },
            { day: 2, label: "Terça" },
            { day: 3, label: "Quarta" },
            { day: 4, label: "Quinta" },
            { day: 5, label: "Sexta" },
          ].map(({ day, label }) => {
            const list = byDay.get(day) ?? [];
            return (
              <div key={day} className="border-t lg:border-t-0 lg:border-l first:lg:border-l-0">
                <div className="border-b bg-black/[0.02] px-4 py-3 text-sm font-semibold">
                  {label} <span className="text-xs text-[var(--muted)]">({list.length})</span>
                </div>

                <div className="p-4 space-y-3">
                  {list.map((e) => (
                    <div key={e.id} className="rounded-2xl border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">
                            {e.customerTradeName ? e.customerTradeName : e.customerName}
                          </div>
                          <div className="truncate text-xs text-[var(--muted)]">
                            {e.customerTradeName ? e.customerName : e.customerCode}
                          </div>
                        </div>
                        <span className={["shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold", statusClasses(e.status)].join(" ")}>
                          {statusLabel(e.status)}
                        </span>
                      </div>

                      <form action={updateRouteEntryAction} className="mt-3 space-y-2">
                        <input type="hidden" name="id" value={e.id} />
                        <select
                          name="status"
                          defaultValue={e.status}
                          className="w-full rounded-xl border bg-[var(--card)] px-3 py-2 text-xs"
                        >
                          <option value="NONE">Sem status</option>
                          <option value="MESSAGE_SENT">Mensagem enviada</option>
                          <option value="ORDER_PLACED">Pedido feito</option>
                        </select>
                        <input
                          name="notes"
                          defaultValue={e.notes ?? ""}
                          placeholder="Observação (opcional)"
                          className="w-full rounded-xl border bg-[var(--card)] px-3 py-2 text-xs"
                        />
                        <button className="w-full rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white">
                          Salvar
                        </button>
                      </form>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <form action={moveRouteEntryAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="direction" value="UP" />
                          <button className="rounded-xl border bg-[var(--card)] px-3 py-2 text-[11px] font-semibold">
                            ↑
                          </button>
                        </form>
                        <form action={moveRouteEntryAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="direction" value="DOWN" />
                          <button className="rounded-xl border bg-[var(--card)] px-3 py-2 text-[11px] font-semibold">
                            ↓
                          </button>
                        </form>
                        <form action={removeRouteEntryAction} className="ml-auto">
                          <input type="hidden" name="id" value={e.id} />
                          <button className="rounded-xl bg-[var(--k2-red-2)] px-3 py-2 text-[11px] font-semibold text-white">
                            Remover
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}

                  {list.length === 0 ? (
                    <div className="rounded-2xl border bg-black/[0.02] px-4 py-8 text-center text-xs text-[var(--muted)]">
                      Nenhum cliente na rota.
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

