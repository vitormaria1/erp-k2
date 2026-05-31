import { getDb } from "@/lib/db";

type MovementRow = {
  createdAt: string;
  reference: string;
  description: string;
  unit: string;
  type: string;
  quantity: number;
  reasonCode: string | null;
  note: string | null;
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function listMovements(from: string, to: string, limit = 500): MovementRow[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT
        sm.created_at as createdAt,
        p.reference as reference,
        p.description as description,
        p.unit as unit,
        sm.type as type,
        sm.quantity as quantity,
        COALESCE(sm.reason_code, sm.reason) as reasonCode,
        sm.note as note
      FROM stock_movements sm
      JOIN products p ON p.id = sm.product_id
      WHERE date(sm.created_at) BETWEEN date(?) AND date(?)
      ORDER BY sm.created_at DESC
      LIMIT ?
    `
    )
    .all(from, to, limit) as MovementRow[];
}

function getSummary(from: string, to: string) {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        SUM(CASE WHEN COALESCE(sm.reason_code, sm.reason) LIKE 'PURCHASE%' AND sm.type = 'IN' THEN sm.quantity ELSE 0 END) as purchaseIn,
        SUM(CASE WHEN COALESCE(sm.reason_code, sm.reason) LIKE 'SALE%' AND sm.type = 'OUT' THEN sm.quantity ELSE 0 END) as salesOut,
        SUM(CASE WHEN COALESCE(sm.reason_code, sm.reason) LIKE 'PRODUCTION_CONSUME%' AND sm.type = 'OUT' THEN sm.quantity ELSE 0 END) as prodConsume,
        SUM(CASE WHEN COALESCE(sm.reason_code, sm.reason) LIKE 'PRODUCTION_FINISH%' AND sm.type = 'IN' THEN sm.quantity ELSE 0 END) as prodFinish
      FROM stock_movements sm
      WHERE date(sm.created_at) BETWEEN date(?) AND date(?)
    `
    )
    .get(from, to) as {
    purchaseIn: number | null;
    salesOut: number | null;
    prodConsume: number | null;
    prodFinish: number | null;
  };
  return {
    purchaseIn: Number(rows.purchaseIn ?? 0),
    salesOut: Number(rows.salesOut ?? 0),
    prodConsume: Number(rows.prodConsume ?? 0),
    prodFinish: Number(rows.prodFinish ?? 0),
  };
}

export default async function RelatoriosPage(props: {
  searchParams?: Promise<{ from?: string; to?: string }>;
}) {
  const sp = (await props.searchParams) ?? {};
  const to = sp.to?.trim() || isoDate(new Date());
  const from =
    sp.from?.trim() ||
    (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return isoDate(d);
    })();

  const movements = listMovements(from, to);
  const summary = getSummary(from, to);

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <h1 className="text-2xl font-semibold">Relatórios</h1>

      <form className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border bg-[var(--card)] p-5" action="/relatorios" method="GET">
        <label className="block space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">De</div>
          <input name="from" type="date" defaultValue={from} className="rounded-xl border bg-[var(--card)] px-3 py-2 text-sm" />
        </label>
        <label className="block space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Até</div>
          <input name="to" type="date" defaultValue={to} className="rounded-xl border bg-[var(--card)] px-3 py-2 text-sm" />
        </label>
        <button className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white">Filtrar</button>
        <div className="ml-auto grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <div className="rounded-xl border bg-black/[0.02] px-3 py-2">
            <div className="text-xs text-[var(--muted)]">Compras (IN)</div>
            <div className="font-semibold">{summary.purchaseIn.toFixed(3)}</div>
          </div>
          <div className="rounded-xl border bg-black/[0.02] px-3 py-2">
            <div className="text-xs text-[var(--muted)]">Vendas (OUT)</div>
            <div className="font-semibold">{summary.salesOut.toFixed(3)}</div>
          </div>
          <div className="rounded-xl border bg-black/[0.02] px-3 py-2">
            <div className="text-xs text-[var(--muted)]">Consumo OP (OUT)</div>
            <div className="font-semibold">{summary.prodConsume.toFixed(3)}</div>
          </div>
          <div className="rounded-xl border bg-black/[0.02] px-3 py-2">
            <div className="text-xs text-[var(--muted)]">Produção OP (IN)</div>
            <div className="font-semibold">{summary.prodFinish.toFixed(3)}</div>
          </div>
        </div>
      </form>

      <div className="mt-6 overflow-hidden rounded-2xl border bg-[var(--card)] shadow-sm">
        <div className="border-b px-5 py-4">
          <div className="text-sm font-semibold">Movimentações de estoque</div>
          <div className="text-sm text-[var(--muted)]">
            Entradas/saídas por compras, pedidos, produção e ajustes (últimas {movements.length}).
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Ref.</th>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3 text-right">Qtd</th>
              <th className="px-4 py-3">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m, idx) => (
              <tr key={idx} className="border-t">
                <td className="px-4 py-3">{new Date(m.createdAt).toLocaleString("pt-BR")}</td>
                <td className="px-4 py-3 font-medium">{m.reference}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold">{m.description}</div>
                  <div className="text-xs text-[var(--muted)]">{m.unit}</div>
                </td>
                <td className="px-4 py-3">{m.type}</td>
                <td className="px-4 py-3 text-right font-semibold">{Number(m.quantity).toFixed(3)}</td>
                <td className="px-4 py-3">
                  <div className="text-[var(--muted)]">{m.reasonCode ?? "-"}</div>
                  {m.note ? <div className="mt-0.5 text-xs font-semibold text-[var(--k2-red-2)]">{m.note}</div> : null}
                </td>
              </tr>
            ))}
            {movements.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-[var(--muted)]" colSpan={6}>
                  Nenhuma movimentação no período.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
