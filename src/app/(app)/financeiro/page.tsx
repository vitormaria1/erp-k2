import { getFiscalDbPool } from "@/fiscal/infra/pg";
import { getDb } from "@/lib/db";
import { formatDate, getSaoPauloDateIso } from "@/lib/datetime";

import {
  closeRouteOrderAction,
  gerarBoletoMockAction,
  settleReceivableAction,
  startRouteClosureAction,
  updateFinanceOrderStatusAction,
  updateReceivableStatusAction,
} from "./actions";
import { getOrderStatusMeta, ORDER_STATUS_VALUES, type OrderStatus } from "../pedidos/status";

type Row = {
  id: string;
  status: string;
  method: string;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  customerName: string;
  orderId: number | null;
  orderStatus: string | null;
  hasBoleto: number;
  createdAt: string;
};

type FiscalInvoiceSummary = {
  invoiceId: string;
  internalStatus: string;
  serie: string;
  numero: number | null;
};

type FiscalInvoiceSummaryRow = {
  sourceOrderId: number;
  invoiceId: string;
  internalStatus: string;
  serie: string;
  numero: number | null;
};

type LoadingRow = {
  id: string;
  createdAt: string;
  notes: string | null;
  ordersCount: number;
};

type RouteCloseRow = {
  orderId: number;
  customerName: string;
  orderStatus: string;
  receivableId: string | null;
  receivableStatus: string | null;
  amount: number | null;
  dueDate: string | null;
  paidAt: string | null;
};

function listReceivables(limit = 120): Row[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT
        r.id as id,
        r.status as status,
        r.method as method,
        r.amount as amount,
        r.due_date as dueDate,
        r.paid_at as paidAt,
        r.created_at as createdAt,
        c.name as customerName,
        r.order_id as orderId,
        o.status as orderStatus,
        CASE WHEN b.receivable_id IS NULL THEN 0 ELSE 1 END as hasBoleto
      FROM receivables r
      JOIN customers c ON c.id = r.customer_id
      LEFT JOIN orders o ON o.id = r.order_id
      LEFT JOIN boletos b ON b.receivable_id = r.id
      ORDER BY r.created_at DESC
      LIMIT ?
    `
    )
    .all(limit) as Row[];
}

function listLoadings(limit = 40): LoadingRow[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT
        l.id as id,
        l.created_at as createdAt,
        l.notes as notes,
        (SELECT COUNT(*) FROM loading_orders lo WHERE lo.loading_id = l.id) as ordersCount
      FROM loadings l
      ORDER BY l.created_at DESC
      LIMIT ?
    `
    )
    .all(limit) as LoadingRow[];
}

function listRouteCloseRows(loadingId: string): RouteCloseRow[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT
        o.id as orderId,
        c.name as customerName,
        o.status as orderStatus,
        r.id as receivableId,
        r.status as receivableStatus,
        r.amount as amount,
        r.due_date as dueDate,
        r.paid_at as paidAt
      FROM loading_orders lo
      JOIN orders o ON o.id = lo.order_id
      JOIN customers c ON c.id = o.customer_id
      LEFT JOIN receivables r ON r.id = (
        SELECT r2.id
        FROM receivables r2
        WHERE r2.order_id = o.id
        ORDER BY r2.created_at DESC
        LIMIT 1
      )
      WHERE lo.loading_id = ?
      ORDER BY c.name ASC, o.id ASC
    `
    )
    .all(loadingId) as RouteCloseRow[];
}

async function loadFiscalInvoicesByOrderId(orderIds: number[]) {
  const byOrderId = new Map<number, FiscalInvoiceSummary>();
  if (orderIds.length === 0) return { byOrderId, available: true };

  try {
    const pool = getFiscalDbPool();
    const res = await pool.query(
      `
      SELECT DISTINCT ON (source_order_id)
        source_order_id as "sourceOrderId",
        id as "invoiceId",
        internal_status as "internalStatus",
        serie,
        numero
      FROM fiscal_invoices
      WHERE source_order_id = ANY($1::bigint[])
      ORDER BY source_order_id, created_at DESC
    `,
      [orderIds]
    );

    for (const row of res.rows as FiscalInvoiceSummaryRow[]) {
      byOrderId.set(row.sourceOrderId, {
        invoiceId: row.invoiceId,
        internalStatus: row.internalStatus,
        serie: row.serie,
        numero: row.numero,
      });
    }
  } catch (error) {
    console.error("loadFiscalInvoicesByOrderId failed", error);
    return { byOrderId, available: false };
  }

  return { byOrderId, available: true };
}

function getFiscalStatusMeta(fiscal: FiscalInvoiceSummary | null, fiscalAvailable: boolean) {
  if (!fiscalAvailable) return { label: "Fiscal indisponivel", className: "bg-zinc-200 text-zinc-700" };
  if (!fiscal) return { label: "Sem NF-e", className: "bg-black/[0.05] text-[var(--muted)]" };
  if (fiscal.internalStatus === "AUTHORIZED") {
    return { label: "Autorizada", className: "bg-emerald-100 text-emerald-800" };
  }
  if (["READY_TO_ISSUE", "ISSUING", "CANCELING"].includes(fiscal.internalStatus)) {
    return { label: fiscal.internalStatus, className: "bg-amber-100 text-amber-800" };
  }
  if (["REJECTED", "DENIED", "ERROR"].includes(fiscal.internalStatus)) {
    return { label: fiscal.internalStatus, className: "bg-red-100 text-red-800" };
  }
  if (fiscal.internalStatus === "CANCELED") {
    return { label: "Cancelada", className: "bg-zinc-200 text-zinc-700" };
  }
  return { label: fiscal.internalStatus, className: "bg-black/[0.05] text-[var(--muted)]" };
}

function deriveReceivableStatus(row: Row) {
  if (row.status === "PAID") return "PAID";
  if (row.status === "CANCELED") return "CANCELED";
  const today = getSaoPauloDateIso();
  const dueDate = row.dueDate.slice(0, 10);
  if (row.status === "OVERDUE" || dueDate < today) return "OVERDUE";
  return "OPEN";
}

function summarize(rows: Array<Row & { derivedStatus: string }>) {
  const total = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const openAmount = rows
    .filter((row) => row.derivedStatus === "OPEN")
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const paidAmount = rows
    .filter((row) => row.derivedStatus === "PAID")
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const overdueAmount = rows
    .filter((row) => row.derivedStatus === "OVERDUE")
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  return {
    totalCount: rows.length,
    total,
    openCount: rows.filter((row) => row.derivedStatus === "OPEN").length,
    paidCount: rows.filter((row) => row.derivedStatus === "PAID").length,
    overdueCount: rows.filter((row) => row.derivedStatus === "OVERDUE").length,
    openAmount,
    paidAmount,
    overdueAmount,
  };
}

function StatCard(props: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{props.label}</div>
      <div className="mt-2 text-3xl font-semibold">{props.value}</div>
      <div className="mt-1 text-sm text-[var(--muted)]">{props.sub}</div>
    </div>
  );
}

export default async function FinanceiroPage(props: {
  searchParams?: Promise<{ loadingId?: string }>;
}) {
  const sp = (await props.searchParams) ?? {};
  const loadingId = sp.loadingId?.trim() ?? "";
  const rawRows = listReceivables();
  const loadings = listLoadings();
  const activeLoadingId = loadingId || loadings[0]?.id || "";
  const routeRows = activeLoadingId ? listRouteCloseRows(activeLoadingId) : [];
  const orderIds = rawRows.flatMap((row) => (typeof row.orderId === "number" ? [row.orderId] : []));
  const routeOrderIds = routeRows.map((row) => row.orderId);
  const { byOrderId: fiscalByOrderId, available: fiscalAvailable } = await loadFiscalInvoicesByOrderId(orderIds);
  const { byOrderId: routeFiscalByOrderId } = await loadFiscalInvoicesByOrderId(routeOrderIds);
  const rows = rawRows.map((row) => ({
    ...row,
    derivedStatus: deriveReceivableStatus(row),
    fiscal: typeof row.orderId === "number" ? fiscalByOrderId.get(row.orderId) ?? null : null,
  }));
  const summary = summarize(rows);
  const routeSummary = {
    orders: routeRows.length,
    amount: routeRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    paid: routeRows.filter((row) => row.receivableStatus === "PAID").length,
    open: routeRows.filter((row) => row.receivableStatus === "OPEN" || row.orderStatus === "ENTREGUE").length,
  };
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <h1 className="text-2xl font-semibold">Financeiro</h1>
      <div className="mt-1 text-sm text-[var(--muted)]">
        Controle de recebiveis, baixa de pagamento e acompanhamento operacional dos pedidos.
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Recebiveis" value={String(summary.totalCount)} sub="Titulos no painel" />
        <StatCard label="Valor total" value={money.format(summary.total)} sub="Soma de todos os titulos" />
        <StatCard label="Em aberto" value={String(summary.openCount)} sub={money.format(summary.openAmount)} />
        <StatCard label="Pagos" value={String(summary.paidCount)} sub={money.format(summary.paidAmount)} />
        <StatCard label="Vencidos" value={String(summary.overdueCount)} sub={money.format(summary.overdueAmount)} />
      </section>

      <section className="mt-6 rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">Fechamento da rota</h2>
            <div className="mt-1 text-sm text-[var(--muted)]">
              Ao fechar a rota, todos os pedidos ficam como entregues. Aqui voce decide apenas quais recebiveis foram pagos e quais continuam em aberto.
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 lg:max-w-xl">
            <form action="/financeiro" method="GET" className="flex w-full flex-col gap-2 sm:flex-row">
              <select
                name="loadingId"
                defaultValue={activeLoadingId}
                className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
              >
                {loadings.length === 0 ? <option value="">Nenhum carregamento</option> : null}
                {loadings.map((loading) => (
                  <option key={loading.id} value={loading.id}>
                    {formatDate(loading.createdAt)} · {loading.ordersCount} pedidos
                  </option>
                ))}
              </select>
              <button className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">Abrir</button>
            </form>
            {activeLoadingId ? (
              <form action={startRouteClosureAction} className="flex">
                <input type="hidden" name="loadingId" value={activeLoadingId} />
                <button className="w-full rounded-xl border px-4 py-3 text-sm font-semibold">
                  Iniciar fechamento da rota
                </button>
              </form>
            ) : null}
          </div>
        </div>

        {activeLoadingId ? (
          <>
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Pedidos na rota" value={String(routeSummary.orders)} sub="Carregamento selecionado" />
              <StatCard label="Valor da rota" value={money.format(routeSummary.amount)} sub="Recebiveis vinculados" />
              <StatCard label="Ja pagos" value={String(routeSummary.paid)} sub="Recebiveis baixados" />
              <StatCard label="Em aberto" value={String(routeSummary.open)} sub="Entregues sem baixa" />
            </div>

            <div className="mt-5 overflow-x-auto rounded-2xl border">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Pedido</th>
                    <th className="px-4 py-3">Status pedido</th>
                    <th className="px-4 py-3">NF</th>
                    <th className="px-4 py-3">Recebivel</th>
                    <th className="px-4 py-3">Valor</th>
                    <th className="px-4 py-3">Vencimento</th>
                    <th className="px-4 py-3">Fechamento</th>
                  </tr>
                </thead>
                <tbody>
                  {routeRows.map((row) => {
                    const orderMeta = getOrderStatusMeta(row.orderStatus);
                    const fiscal = routeFiscalByOrderId.get(row.orderId) ?? null;
                    const fiscalMeta = getFiscalStatusMeta(fiscal, fiscalAvailable);
                    return (
                      <tr key={row.orderId} className="border-t align-top">
                        <td className="px-4 py-3 font-semibold">{row.customerName}</td>
                        <td className="px-4 py-3">#{row.orderId}</td>
                        <td className="px-4 py-3">
                          <span className={["inline-flex rounded-full px-3 py-1 text-xs font-semibold", orderMeta.className].join(" ")}>
                            {orderMeta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-2">
                            <span className={["inline-flex rounded-full px-3 py-1 text-xs font-semibold", fiscalMeta.className].join(" ")}>
                              {fiscalMeta.label}
                            </span>
                            {fiscal ? (
                              <div className="text-xs text-[var(--muted)]">
                                {fiscal.serie}/{fiscal.numero ?? "-"}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {row.receivableId ? (
                            <div>
                              <div className="font-medium">{row.receivableStatus ?? "OPEN"}</div>
                              <div className="text-xs text-[var(--muted)]">
                                {row.paidAt ? `Pago em ${formatDate(row.paidAt)}` : "Sem baixa"}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-[var(--muted)]">Sem recebivel</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold">{money.format(Number(row.amount ?? 0))}</td>
                        <td className="px-4 py-3">{row.dueDate ? formatDate(row.dueDate) : "-"}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <form action={closeRouteOrderAction}>
                              <input type="hidden" name="orderId" value={row.orderId} />
                              <input type="hidden" name="mode" value="PAID" />
                              <button className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white">
                                Marcar pago
                              </button>
                            </form>
                            <form action={closeRouteOrderAction}>
                              <input type="hidden" name="orderId" value={row.orderId} />
                              <input type="hidden" name="mode" value="OPEN" />
                              <button className="rounded-xl border px-3 py-2 text-xs font-semibold">
                                Deixar em aberto
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {routeRows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-[var(--muted)]" colSpan={8}>
                        Nenhum pedido encontrado nesse carregamento.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-xl border p-4 text-sm text-[var(--muted)]">
            Nenhum carregamento disponivel para fechamento.
          </div>
        )}
      </section>

      <div className="mt-6 overflow-x-auto rounded-2xl border bg-[var(--card)] shadow-sm">
        <table className="w-full min-w-[1500px] text-sm">
          <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Pedido</th>
              <th className="px-4 py-3">Status pedido</th>
              <th className="px-4 py-3">Nota fiscal</th>
              <th className="px-4 py-3">Metodo</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3">Pagamento</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Status recebivel</th>
              <th className="px-4 py-3">Boleto</th>
              <th className="px-4 py-3">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const orderStatus = r.orderStatus ? (r.orderStatus as OrderStatus | string) : null;
              const orderMeta = orderStatus ? getOrderStatusMeta(orderStatus) : null;
              const fiscalMeta = getFiscalStatusMeta(r.fiscal, fiscalAvailable);
              return (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{r.customerName}</div>
                    <div className="text-xs text-[var(--muted)]">Lancado em {formatDate(r.createdAt)}</div>
                  </td>
                  <td className="px-4 py-3">{r.orderId ? `#${r.orderId}` : "-"}</td>
                  <td className="px-4 py-3">
                    {typeof r.orderId === "number" && orderMeta ? (
                      <div className="space-y-2">
                        <span className={["inline-flex rounded-full px-3 py-1 text-xs font-semibold", orderMeta.className].join(" ")}>
                          {orderMeta.label}
                        </span>
                        <form action={updateFinanceOrderStatusAction.bind(null, r.orderId)} className="flex gap-2">
                          <select
                            name="status"
                            defaultValue={r.orderStatus ?? "FEITO"}
                            className="rounded-xl border bg-[var(--card)] px-3 py-2 text-xs"
                          >
                            {ORDER_STATUS_VALUES.map((status) => (
                              <option key={status} value={status}>
                                {getOrderStatusMeta(status).label}
                              </option>
                            ))}
                          </select>
                          <button className="rounded-xl border px-3 py-2 text-xs font-semibold">Salvar</button>
                        </form>
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">Sem pedido</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-2">
                      <span className={["inline-flex rounded-full px-3 py-1 text-xs font-semibold", fiscalMeta.className].join(" ")}>
                        {fiscalMeta.label}
                      </span>
                      {r.fiscal ? (
                        <div className="text-xs text-[var(--muted)]">
                          {r.fiscal.serie}/{r.fiscal.numero ?? "-"}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {r.fiscal ? (
                          <a
                            className="rounded-lg border px-2 py-1 text-xs font-semibold"
                            href={`/nota-fiscal?invoiceId=${encodeURIComponent(r.fiscal.invoiceId)}`}
                          >
                            Ver NF
                          </a>
                        ) : null}
                        {r.fiscal && ["AUTHORIZED", "ISSUING"].includes(r.fiscal.internalStatus) ? (
                          <form action={`/api/fiscal/invoices/${r.fiscal.invoiceId}/cancel`} method="post">
                            <input type="hidden" name="justificativa" value="Cancelamento solicitado pelo financeiro" />
                            <button className="rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-700">
                              Cancelar NF
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{r.method}</td>
                  <td className="px-4 py-3">{formatDate(r.dueDate)}</td>
                  <td className="px-4 py-3">{r.paidAt ? formatDate(r.paidAt) : "-"}</td>
                  <td className="px-4 py-3 font-semibold">{money.format(r.amount)}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-2">
                      <span
                        className={[
                          "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                          r.derivedStatus === "PAID"
                            ? "bg-emerald-100 text-emerald-800"
                            : r.derivedStatus === "OVERDUE"
                              ? "bg-red-100 text-red-800"
                              : r.derivedStatus === "CANCELED"
                                ? "bg-zinc-200 text-zinc-700"
                                : "bg-amber-100 text-amber-800",
                        ].join(" ")}
                      >
                        {r.derivedStatus}
                      </span>
                      <form action={updateReceivableStatusAction.bind(null, r.id)} className="flex gap-2">
                        <select
                          name="status"
                          defaultValue={r.status}
                          className="rounded-xl border bg-[var(--card)] px-3 py-2 text-xs"
                        >
                          <option value="OPEN">Aberto</option>
                          <option value="PAID">Pago</option>
                          <option value="OVERDUE">Vencido</option>
                          <option value="CANCELED">Cancelado</option>
                        </select>
                        <button className="rounded-xl border px-3 py-2 text-xs font-semibold">Salvar</button>
                      </form>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {r.method === "BOLETO" ? (
                      r.hasBoleto ? (
                        <span className="text-xs text-[var(--muted)]">Gerado</span>
                      ) : (
                        <form action={gerarBoletoMockAction}>
                          <input type="hidden" name="receivableId" value={r.id} />
                          <button className="rounded-xl border bg-[var(--card)] px-3 py-2 text-xs font-semibold hover:bg-black/[0.03]">
                            Gerar
                          </button>
                        </form>
                      )
                    ) : (
                      <span className="text-xs text-[var(--muted)]">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {r.status !== "PAID" ? (
                        <form action={settleReceivableAction}>
                          <input type="hidden" name="receivableId" value={r.id} />
                          <button className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white">
                            Dar baixa
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">Baixado</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-[var(--muted)]" colSpan={11}>
                  Nenhum recebivel ainda. Ao criar pedido com preco, um recebivel e criado automaticamente.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
