import { getFiscalDbPool } from "@/fiscal/infra/pg";
import { getDb } from "@/lib/db";
import { formatDate, formatDateTime, getSaoPauloDateIso, startOfSaoPauloWeekIso } from "@/lib/datetime";
import { ensureFinancialSchema } from "@/lib/financial-ledger";
import { getOrderPaymentMethodLabel } from "@/lib/payments";
import { isFinanceAuthenticated } from "@/lib/simple-auth";

import {
  closeRouteOrderAction,
  financeLockAction,
  gerarBoletoMockAction,
  settleReceivableAction,
  settlePayableAction,
  startRouteClosureAction,
  updateFinanceOrderStatusAction,
  updatePayableStatusAction,
  updateReceivableStatusAction,
} from "./actions";
import { FinanceUnlockForm } from "./unlock-form";
import {
  getOrderStatusMeta,
  isOrderStatus,
  normalizeOrderStatus,
  ORDER_STATUS_VALUES,
  type OrderStatus,
} from "../pedidos/status";

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

type PayableRow = {
  id: string;
  status: string;
  method: string;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  paymentRef: string | null;
  supplierName: string | null;
  purchaseInvoiceId: string | null;
  purchaseInvoiceNumber: string | null;
  createdAt: string;
};

type RouteCloseRow = {
  orderId: number;
  customerName: string;
  orderStatus: string;
  receivableId: string | null;
  receivableStatus: string | null;
  receivablesCount: number;
  amount: number | null;
  dueDate: string | null;
  paidAt: string | null;
};

type CashSummary = {
  incoming: number;
  outgoing: number;
};

type CashMovementRow = {
  id: string;
  kind: "IN" | "OUT";
  sourceType: "RECEIVABLE" | "PAYABLE";
  method: string | null;
  amount: number;
  effectiveDate: string;
  note: string | null;
  customerName: string | null;
  supplierName: string | null;
  orderId: number | null;
  purchaseInvoiceNumber: string | null;
};

type CashPeriod = {
  from: string;
  to: string;
  preset: "today" | "week" | "custom";
};

type CashMethodSummary = {
  method: string;
  label: string;
  incoming: number;
  outgoing: number;
  balance: number;
  movements: number;
};

type CashDaySummary = {
  date: string;
  incoming: number;
  outgoing: number;
  balance: number;
  movements: number;
};

function listReceivables(limit = 120): Row[] {
  const db = getDb();
  ensureFinancialSchema(db);
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

function listPayables(limit = 120): PayableRow[] {
  const db = getDb();
  ensureFinancialSchema(db);
  return db
    .prepare(
      `
      SELECT
        p.id as id,
        p.status as status,
        p.method as method,
        p.amount as amount,
        p.due_date as dueDate,
        p.paid_at as paidAt,
        p.payment_ref as paymentRef,
        p.supplier_name as supplierName,
        p.purchase_invoice_id as purchaseInvoiceId,
        pi.number as purchaseInvoiceNumber,
        p.created_at as createdAt
      FROM payables p
      LEFT JOIN purchase_invoices pi ON pi.id = p.purchase_invoice_id
      ORDER BY p.created_at DESC
      LIMIT ?
    `
    )
    .all(limit) as PayableRow[];
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

function resolveCashPeriod(searchParams: { from?: string; to?: string; preset?: string }): CashPeriod {
  const today = getSaoPauloDateIso();
  const from = searchParams.from?.trim() ?? "";
  const to = searchParams.to?.trim() ?? "";

  if (from && to) {
    return { from, to, preset: "custom" };
  }

  if (searchParams.preset === "week") {
    return { from: startOfSaoPauloWeekIso(), to: today, preset: "week" };
  }

  return { from: today, to: today, preset: "today" };
}

function getCashSummary(period: CashPeriod): CashSummary {
  const db = getDb();
  ensureFinancialSchema(db);
  const incoming =
    ((db
      .prepare(
        `
        SELECT COALESCE(SUM(amount), 0) as s
        FROM cash_movements
        WHERE kind = 'IN'
          AND effective_date::date BETWEEN ?::date AND ?::date
      `
      )
      .get(period.from, period.to) as { s: number }).s ?? 0);
  const outgoing =
    ((db
      .prepare(
        `
        SELECT COALESCE(SUM(amount), 0) as s
        FROM cash_movements
        WHERE kind = 'OUT'
          AND effective_date::date BETWEEN ?::date AND ?::date
      `
      )
      .get(period.from, period.to) as { s: number }).s ?? 0);
  return { incoming, outgoing };
}

function listCashMovements(period: CashPeriod, limit = 160): CashMovementRow[] {
  const db = getDb();
  ensureFinancialSchema(db);
  return db
    .prepare(
      `
      SELECT
        cm.id as id,
        cm.kind as kind,
        cm.source_type as sourceType,
        cm.method as method,
        cm.amount as amount,
        cm.effective_date as effectiveDate,
        cm.note as note,
        c.name as customerName,
        p.supplier_name as supplierName,
        r.order_id as orderId,
        pi.number as purchaseInvoiceNumber
      FROM cash_movements cm
      LEFT JOIN receivables r ON cm.source_type = 'RECEIVABLE' AND r.id::text = cm.source_id
      LEFT JOIN customers c ON c.id = r.customer_id
      LEFT JOIN payables p ON cm.source_type = 'PAYABLE' AND p.id::text = cm.source_id
      LEFT JOIN purchase_invoices pi ON pi.id = p.purchase_invoice_id
      WHERE cm.effective_date::date BETWEEN ?::date AND ?::date
      ORDER BY cm.effective_date DESC, cm.created_at DESC
      LIMIT ?
    `
    )
    .all(period.from, period.to, limit) as CashMovementRow[];
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
        (
          SELECT r2.id
          FROM receivables r2
          WHERE r2.order_id = o.id
          ORDER BY r2.created_at DESC
          LIMIT 1
        ) as receivableId,
        (
          SELECT COUNT(*)
          FROM receivables r2
          WHERE r2.order_id = o.id
        ) as receivablesCount,
        (
          SELECT
            CASE
              WHEN COUNT(*) = 0 THEN NULL
              WHEN COUNT(*) FILTER (WHERE status = 'PAID') = COUNT(*) THEN 'PAID'
              WHEN COUNT(*) FILTER (WHERE status = 'CANCELED') = COUNT(*) THEN 'CANCELED'
              ELSE 'OPEN'
            END
          FROM receivables r2
          WHERE r2.order_id = o.id
        ) as receivableStatus,
        (
          SELECT COALESCE(SUM(r2.amount), 0)
          FROM receivables r2
          WHERE r2.order_id = o.id AND r2.status <> 'CANCELED'
        ) as amount,
        (
          SELECT MIN(r2.due_date)
          FROM receivables r2
          WHERE r2.order_id = o.id AND r2.status <> 'CANCELED'
        ) as dueDate,
        (
          SELECT MAX(r2.paid_at)
          FROM receivables r2
          WHERE r2.order_id = o.id
        ) as paidAt
      FROM loading_orders lo
      JOIN orders o ON o.id = lo.order_id
      JOIN customers c ON c.id = o.customer_id
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
  if (fiscal.internalStatus === "TEMP_ERROR") {
    return { label: "Instabilidade", className: "bg-orange-100 text-orange-800" };
  }
  if (["REJECTED", "DENIED", "ERROR"].includes(fiscal.internalStatus)) {
    return { label: "Falha final", className: "bg-red-100 text-red-800" };
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
  if (row.status === "OVERDUE" || dueDate < today) return "PENDING";
  return "PENDING";
}

function getPaymentMeta(status: string) {
  if (status === "PAID") return { label: "Pago", className: "bg-emerald-100 text-emerald-800" };
  if (status === "CANCELED") return { label: "Cancelado", className: "bg-zinc-200 text-zinc-700" };
  return { label: "Pendente", className: "bg-amber-100 text-amber-800" };
}

function getPayableMeta(status: string) {
  if (status === "PAID") return { label: "Pago", className: "bg-emerald-100 text-emerald-800" };
  if (status === "CANCELED") return { label: "Cancelado", className: "bg-zinc-200 text-zinc-700" };
  return { label: "Pendente", className: "bg-amber-100 text-amber-800" };
}

function getReceivableFormStatus(status: string) {
  if (status === "PAID") return "PAID";
  if (status === "CANCELED") return "CANCELED";
  return "OPEN";
}

function getNormalizedOrderStatus(value: string | null): OrderStatus {
  const normalized = normalizeOrderStatus(value ?? "");
  return isOrderStatus(normalized) ? normalized : "FEITO";
}

function summarize(rows: Array<Row & { derivedStatus: string }>) {
  const total = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const pendingAmount = rows
    .filter((row) => row.derivedStatus === "PENDING")
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const paidAmount = rows
    .filter((row) => row.derivedStatus === "PAID")
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const canceledAmount = rows
    .filter((row) => row.derivedStatus === "CANCELED")
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  return {
    totalCount: rows.length,
    total,
    pendingCount: rows.filter((row) => row.derivedStatus === "PENDING").length,
    paidCount: rows.filter((row) => row.derivedStatus === "PAID").length,
    canceledCount: rows.filter((row) => row.derivedStatus === "CANCELED").length,
    pendingAmount,
    paidAmount,
    canceledAmount,
  };
}

function summarizePayables(rows: PayableRow[]) {
  const total = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const pendingAmount = rows
    .filter((row) => row.status === "PENDING")
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const paidAmount = rows
    .filter((row) => row.status === "PAID")
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const canceledAmount = rows
    .filter((row) => row.status === "CANCELED")
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  return {
    totalCount: rows.length,
    total,
    pendingCount: rows.filter((row) => row.status === "PENDING").length,
    paidCount: rows.filter((row) => row.status === "PAID").length,
    canceledCount: rows.filter((row) => row.status === "CANCELED").length,
    pendingAmount,
    paidAmount,
    canceledAmount,
  };
}

function summarizeCashByMethod(rows: CashMovementRow[]) {
  const map = new Map<string, CashMethodSummary>();

  for (const row of rows) {
    const key = row.method ?? "UNSPECIFIED";
    const current = map.get(key) ?? {
      method: key,
      label: getOrderPaymentMethodLabel(row.method),
      incoming: 0,
      outgoing: 0,
      balance: 0,
      movements: 0,
    };

    if (row.kind === "IN") current.incoming += Number(row.amount ?? 0);
    else current.outgoing += Number(row.amount ?? 0);

    current.balance = current.incoming - current.outgoing;
    current.movements += 1;
    map.set(key, current);
  }

  return [...map.values()].sort(
    (a, b) =>
      b.incoming + b.outgoing - (a.incoming + a.outgoing) ||
      b.movements - a.movements ||
      a.label.localeCompare(b.label)
  );
}

function summarizeCashByDay(rows: CashMovementRow[]) {
  const map = new Map<string, CashDaySummary>();

  for (const row of rows) {
    const key = row.effectiveDate.slice(0, 10);
    const current = map.get(key) ?? {
      date: key,
      incoming: 0,
      outgoing: 0,
      balance: 0,
      movements: 0,
    };

    if (row.kind === "IN") current.incoming += Number(row.amount ?? 0);
    else current.outgoing += Number(row.amount ?? 0);

    current.balance = current.incoming - current.outgoing;
    current.movements += 1;
    map.set(key, current);
  }

  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
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
  searchParams?: Promise<{ loadingId?: string; from?: string; to?: string; preset?: string }>;
}) {
  if (!(await isFinanceAuthenticated())) {
    return <FinanceUnlockForm />;
  }

  const sp = (await props.searchParams) ?? {};
  const loadingId = sp.loadingId?.trim() ?? "";
  const cashPeriod = resolveCashPeriod(sp);
  const rawRows = listReceivables();
  const payables = listPayables();
  const loadings = listLoadings();
  const cashMovements = listCashMovements(cashPeriod);
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
  const payableSummary = summarizePayables(payables);
  const cashSummary = getCashSummary(cashPeriod);
  const cashByMethod = summarizeCashByMethod(cashMovements);
  const cashByDay = summarizeCashByDay(cashMovements);
  const cashVolume = cashSummary.incoming + cashSummary.outgoing;
  const routeSummary = {
    orders: routeRows.length,
    amount: routeRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    paid: routeRows.filter((row) => row.receivableStatus === "PAID").length,
    pending: routeRows.filter((row) => row.receivableStatus !== "PAID").length,
  };
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <h1 className="text-2xl font-semibold">Financeiro</h1>
      <div className="mt-1 text-sm text-[var(--muted)]">
        Controle de pagamentos, caixa e acompanhamento operacional dos pedidos.
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Titulos" value={String(summary.totalCount)} sub="Lancamentos no painel" />
        <StatCard label="Valor total" value={money.format(summary.total)} sub="Soma de todos os titulos" />
        <StatCard label="Pendentes" value={String(summary.pendingCount)} sub={money.format(summary.pendingAmount)} />
        <StatCard label="Pagos" value={String(summary.paidCount)} sub={money.format(summary.paidAmount)} />
        <StatCard label="Cancelados" value={String(summary.canceledCount)} sub={money.format(summary.canceledAmount)} />
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Entradas" value={money.format(cashSummary.incoming)} sub="Recebimentos no periodo" />
        <StatCard label="Saidas" value={money.format(cashSummary.outgoing)} sub="Pagamentos no periodo" />
        <StatCard
          label="Saldo do periodo"
          value={money.format(cashSummary.incoming - cashSummary.outgoing)}
          sub="Entradas menos saidas"
        />
      </section>

      <section className="mt-6 rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">Caixa</h2>
            <div className="mt-1 text-sm text-[var(--muted)]">
              Filtro simples para acompanhar o que entrou e saiu no dia ou na semana.
            </div>
          </div>
          <form action="/financeiro" method="GET" className="flex flex-col gap-2 lg:flex-row lg:items-end">
            {activeLoadingId ? <input type="hidden" name="loadingId" value={activeLoadingId} /> : null}
            <select
              name="preset"
              defaultValue={cashPeriod.preset}
              className="rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
            >
              <option value="today">Hoje</option>
              <option value="week">Semana</option>
              <option value="custom">Periodo manual</option>
            </select>
            <input
              name="from"
              type="date"
              defaultValue={cashPeriod.from}
              className="rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
            />
            <input
              name="to"
              type="date"
              defaultValue={cashPeriod.to}
              className="rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
            />
            <button className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">Aplicar</button>
          </form>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Origem</th>
                <th className="px-4 py-3">Metodo</th>
                <th className="px-4 py-3">Referencia</th>
                <th className="px-4 py-3">Valor</th>
              </tr>
            </thead>
            <tbody>
              {cashMovements.map((movement) => (
                <tr key={movement.id} className="border-t">
                  <td className="px-4 py-3">{formatDateTime(movement.effectiveDate)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                        movement.kind === "IN" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800",
                      ].join(" ")}
                    >
                      {movement.kind === "IN" ? "Entrada" : "Saida"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{movement.sourceType === "RECEIVABLE" ? "Recebimento" : "Pagamento"}</td>
                  <td className="px-4 py-3">{movement.method ?? "-"}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">
                      {movement.customerName ?? movement.supplierName ?? movement.note ?? "-"}
                    </div>
                    <div className="text-xs text-[var(--muted)]">
                      {movement.orderId
                        ? `Pedido #${movement.orderId}`
                        : movement.purchaseInvoiceNumber
                          ? `Nota ${movement.purchaseInvoiceNumber}`
                          : movement.note ?? "-"}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold">{money.format(Number(movement.amount ?? 0))}</td>
                </tr>
              ))}
              {cashMovements.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-[var(--muted)]" colSpan={6}>
                    Nenhuma movimentacao encontrada nesse periodo.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
        <div>
          <h2 className="text-base font-semibold">Relatorio de fluxo de caixa</h2>
          <div className="mt-1 text-sm text-[var(--muted)]">
            Consolidado do periodo filtrado, com totais por metodo e fechamento diario.
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Dias com movimento"
            value={String(cashByDay.length)}
            sub={cashByDay.length > 0 ? `${formatDate(cashByDay.at(-1)?.date)} a ${formatDate(cashByDay[0]?.date)}` : "Sem lancamentos"}
          />
          <StatCard
            label="Metodos usados"
            value={String(cashByMethod.length)}
            sub="Formas de pagamento no periodo"
          />
          <StatCard
            label="Volume movimentado"
            value={money.format(cashVolume)}
            sub="Entradas mais saidas"
          />
          <StatCard
            label="Media diaria"
            value={money.format(cashByDay.length > 0 ? cashVolume / cashByDay.length : 0)}
            sub="Volume medio por dia com movimento"
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-[540px] text-sm">
              <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">Metodo</th>
                  <th className="px-4 py-3">Entradas</th>
                  <th className="px-4 py-3">Saidas</th>
                  <th className="px-4 py-3">Saldo</th>
                  <th className="px-4 py-3">Mov.</th>
                </tr>
              </thead>
              <tbody>
                {cashByMethod.map((row) => (
                  <tr key={row.method} className="border-t">
                    <td className="px-4 py-3 font-semibold">{row.label}</td>
                    <td className="px-4 py-3">{money.format(row.incoming)}</td>
                    <td className="px-4 py-3">{money.format(row.outgoing)}</td>
                    <td className="px-4 py-3 font-semibold">{money.format(row.balance)}</td>
                    <td className="px-4 py-3">{row.movements}</td>
                  </tr>
                ))}
                {cashByMethod.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-[var(--muted)]" colSpan={5}>
                      Nenhum metodo encontrado no periodo.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-[540px] text-sm">
              <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Entradas</th>
                  <th className="px-4 py-3">Saidas</th>
                  <th className="px-4 py-3">Saldo</th>
                  <th className="px-4 py-3">Mov.</th>
                </tr>
              </thead>
              <tbody>
                {cashByDay.map((row) => (
                  <tr key={row.date} className="border-t">
                    <td className="px-4 py-3 font-semibold">{formatDate(row.date)}</td>
                    <td className="px-4 py-3">{money.format(row.incoming)}</td>
                    <td className="px-4 py-3">{money.format(row.outgoing)}</td>
                    <td className="px-4 py-3 font-semibold">{money.format(row.balance)}</td>
                    <td className="px-4 py-3">{row.movements}</td>
                  </tr>
                ))}
                {cashByDay.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-[var(--muted)]" colSpan={5}>
                      Nenhum fechamento diario encontrado no periodo.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">Fechamento da rota</h2>
            <div className="mt-1 text-sm text-[var(--muted)]">
              Ao fechar a rota, todos os pedidos ficam como entregues. Aqui voce decide apenas quais pagamentos foram recebidos e quais seguem pendentes.
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 lg:max-w-xl">
            <form action="/financeiro" method="GET" className="flex w-full flex-col gap-2 sm:flex-row">
              <input type="hidden" name="preset" value={cashPeriod.preset} />
              <input type="hidden" name="from" value={cashPeriod.from} />
              <input type="hidden" name="to" value={cashPeriod.to} />
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
              <StatCard label="Valor da rota" value={money.format(routeSummary.amount)} sub="Total previsto da rota" />
              <StatCard label="Ja pagos" value={String(routeSummary.paid)} sub="Pagamentos recebidos" />
              <StatCard label="Pendentes" value={String(routeSummary.pending)} sub="Entregues sem pagamento" />
            </div>

            <div className="mt-5 overflow-x-auto rounded-2xl border">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Pedido</th>
                    <th className="px-4 py-3">Status pedido</th>
                    <th className="px-4 py-3">NF</th>
                    <th className="px-4 py-3">Pagamento</th>
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
                              <span
                                className={[
                                  "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                                  getPaymentMeta(row.receivableStatus ?? "OPEN").className,
                                ].join(" ")}
                              >
                                {getPaymentMeta(row.receivableStatus ?? "OPEN").label}
                              </span>
                              <div className="text-xs text-[var(--muted)]">
                                {row.receivablesCount > 1 ? `${row.receivablesCount} parcelas` : "1 parcela"}
                                {row.paidAt ? ` · Pago em ${formatDate(row.paidAt)}` : " · Sem baixa"}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-[var(--muted)]">Sem titulo</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold">{money.format(Number(row.amount ?? 0))}</td>
                        <td className="px-4 py-3">{row.dueDate ? formatDate(row.dueDate) : "-"}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <form action={closeRouteOrderAction}>
                              <input type="hidden" name="orderId" value={row.orderId} />
                              <input type="hidden" name="mode" value="PAID" />
                              <input type="hidden" name="effectiveDate" value={getSaoPauloDateIso()} />
                              <button className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white">
                                Marcar pago
                              </button>
                            </form>
                            <form action={closeRouteOrderAction}>
                              <input type="hidden" name="orderId" value={row.orderId} />
                              <input type="hidden" name="mode" value="OPEN" />
                              <button className="rounded-xl border px-3 py-2 text-xs font-semibold">
                                Deixar pendente
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

      <section className="mt-6">
        <div className="mb-3">
          <h2 className="text-base font-semibold">Contas a receber</h2>
          <div className="text-sm text-[var(--muted)]">Baixas de clientes e status financeiro dos pedidos faturados.</div>
        </div>
        <form action={financeLockAction} className="mb-3">
          <button className="rounded-xl border px-4 py-2 text-xs font-semibold">Bloquear financeiro</button>
        </form>
        <div className="overflow-x-auto rounded-2xl border bg-[var(--card)] shadow-sm">
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
                <th className="px-4 py-3">Financeiro</th>
                <th className="px-4 py-3">Boleto</th>
                <th className="px-4 py-3">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const orderStatus = r.orderStatus ? (r.orderStatus as OrderStatus | string) : null;
                const orderMeta = orderStatus ? getOrderStatusMeta(orderStatus) : null;
                const orderSelectValue = getNormalizedOrderStatus(r.orderStatus);
                const fiscalMeta = getFiscalStatusMeta(r.fiscal, fiscalAvailable);
                const paymentMeta = getPaymentMeta(r.status);
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
                            defaultValue={orderSelectValue}
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
                  <td className="px-4 py-3">{getOrderPaymentMethodLabel(r.method)}</td>
                  <td className="px-4 py-3">{formatDate(r.dueDate)}</td>
                  <td className="px-4 py-3">{r.paidAt ? formatDate(r.paidAt) : "-"}</td>
                  <td className="px-4 py-3 font-semibold">{money.format(r.amount)}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-2">
                      <span className={["inline-flex rounded-full px-3 py-1 text-xs font-semibold", paymentMeta.className].join(" ")}>
                        {paymentMeta.label}
                      </span>
                      <form action={updateReceivableStatusAction.bind(null, r.id)} className="flex flex-wrap gap-2">
                        <select name="method" defaultValue={r.method} className="rounded-xl border bg-[var(--card)] px-3 py-2 text-xs">
                          <option value="PIX">Pix</option>
                          <option value="CASH">Dinheiro</option>
                          <option value="BOLETO">Boleto</option>
                        </select>
                        <select
                          name="status"
                          defaultValue={getReceivableFormStatus(r.status)}
                          className="rounded-xl border bg-[var(--card)] px-3 py-2 text-xs"
                        >
                          <option value="OPEN">Pendente</option>
                          <option value="PAID">Pago</option>
                          <option value="CANCELED">Cancelado</option>
                        </select>
                        <input
                          name="dueDate"
                          type="date"
                          defaultValue={r.dueDate.slice(0, 10)}
                          className="rounded-xl border bg-[var(--card)] px-3 py-2 text-xs"
                        />
                        <input
                          name="effectiveDate"
                          type="date"
                          defaultValue={getSaoPauloDateIso()}
                          className="rounded-xl border bg-[var(--card)] px-3 py-2 text-xs"
                        />
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
                        <form action={settleReceivableAction} className="flex flex-wrap gap-2">
                          <input type="hidden" name="receivableId" value={r.id} />
                          <select name="method" defaultValue={r.method} className="rounded-xl border bg-[var(--card)] px-3 py-2 text-xs">
                            <option value="PIX">Pix</option>
                            <option value="CASH">Dinheiro</option>
                            <option value="BOLETO">Boleto</option>
                          </select>
                          <input
                            name="effectiveDate"
                            type="date"
                            defaultValue={getSaoPauloDateIso()}
                            className="rounded-xl border bg-[var(--card)] px-3 py-2 text-xs"
                          />
                          <button className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white">
                            Marcar pago
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
      </section>

      <section className="mt-6">
        <div className="mb-3">
          <h2 className="text-base font-semibold">Contas a pagar</h2>
          <div className="text-sm text-[var(--muted)]">
            Titulos gerados pelas notas de entrada, com baixa e impacto direto no caixa.
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Titulos" value={String(payableSummary.totalCount)} sub="Lancamentos de compras" />
          <StatCard label="Valor total" value={money.format(payableSummary.total)} sub="Soma das obrigacoes" />
          <StatCard
            label="Pendentes"
            value={String(payableSummary.pendingCount)}
            sub={money.format(payableSummary.pendingAmount)}
          />
          <StatCard label="Pagos" value={String(payableSummary.paidCount)} sub={money.format(payableSummary.paidAmount)} />
          <StatCard
            label="Cancelados"
            value={String(payableSummary.canceledCount)}
            sub={money.format(payableSummary.canceledAmount)}
          />
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border bg-[var(--card)] shadow-sm">
          <table className="w-full min-w-[1250px] text-sm">
            <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Fornecedor</th>
                <th className="px-4 py-3">Nota</th>
                <th className="px-4 py-3">Metodo</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Pagamento</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Financeiro</th>
                <th className="px-4 py-3">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {payables.map((payable) => {
                const payableMeta = getPayableMeta(payable.status);
                return (
                  <tr key={payable.id} className="border-t align-top">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{payable.supplierName ?? "-"}</div>
                      <div className="text-xs text-[var(--muted)]">Lancado em {formatDate(payable.createdAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{payable.purchaseInvoiceNumber ?? "-"}</div>
                      {payable.paymentRef ? (
                        <div className="text-xs text-[var(--muted)]">{payable.paymentRef}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{payable.method}</td>
                    <td className="px-4 py-3">{formatDate(payable.dueDate)}</td>
                    <td className="px-4 py-3">{payable.paidAt ? formatDate(payable.paidAt) : "-"}</td>
                    <td className="px-4 py-3 font-semibold">{money.format(Number(payable.amount ?? 0))}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        <span className={["inline-flex rounded-full px-3 py-1 text-xs font-semibold", payableMeta.className].join(" ")}>
                          {payableMeta.label}
                        </span>
                        <form action={updatePayableStatusAction.bind(null, payable.id)} className="flex flex-wrap gap-2">
                          <select
                            name="status"
                            defaultValue={payable.status}
                            className="rounded-xl border bg-[var(--card)] px-3 py-2 text-xs"
                          >
                            <option value="PENDING">Pendente</option>
                            <option value="PAID">Pago</option>
                            <option value="CANCELED">Cancelado</option>
                          </select>
                          <input
                            name="effectiveDate"
                            type="date"
                            defaultValue={getSaoPauloDateIso()}
                            className="rounded-xl border bg-[var(--card)] px-3 py-2 text-xs"
                          />
                          <button className="rounded-xl border px-3 py-2 text-xs font-semibold">Salvar</button>
                        </form>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {payable.status !== "PAID" ? (
                        <form action={settlePayableAction}>
                          <input type="hidden" name="payableId" value={payable.id} />
                          <input type="hidden" name="effectiveDate" value={getSaoPauloDateIso()} />
                          <button className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white">
                            Marcar pago
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">Baixado</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {payables.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-[var(--muted)]" colSpan={8}>
                    Nenhuma conta a pagar ainda. As novas notas de compra passam a criar esse compromisso automaticamente.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
