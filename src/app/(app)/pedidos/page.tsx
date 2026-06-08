import Link from "next/link";

import { getDb } from "@/lib/db";
import { parseAppDate } from "@/lib/datetime";
import { formatDateTime, getSaoPauloDateIso, getSaoPauloYearMonth } from "@/lib/datetime";
import { ensureOrderPaymentSchema, getOrderPaymentMethodLabel } from "@/lib/payments";
import { getFiscalDbPool } from "@/fiscal/infra/pg";
import { getConfiguredFocusAmbiente } from "@/fiscal/providers/focus";

import { updateOrderStatusAction } from "./actions";
import { IssueInvoiceButton } from "./issue-invoice-button";
import { getOrderStatusMeta, normalizeOrderStatus, ORDER_STATUS_VALUES, type OrderStatus } from "./status";

type Row = {
  id: number;
  createdAt: string;
  status: OrderStatus;
  customerName: string;
  notes: string | null;
  itemsCount: number;
  totalAmount: number;
  paymentMethod: string;
  customerAddressOk: boolean;
  fiscal: FiscalInvoiceSummary | null;
  fiscalAvailable: boolean;
};

type QueryFilters = {
  q: string;
  status: string;
  fiscal: string;
  period: string;
  from: string;
  to: string;
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

function normalizeLegacyOrderStatuses() {
  const db = getDb();
  db.prepare(
    `
    UPDATE orders
    SET
      status = CASE
        WHEN status = 'PENDING' THEN 'FEITO'
        WHEN status = 'CONFIRMED' THEN 'SEPARADO'
        WHEN status = 'IN_PRODUCTION' THEN 'SEPARADO'
        WHEN status = 'READY' THEN 'ENVIADO'
        WHEN status = 'PAGO' THEN 'ENTREGUE'
        WHEN status = 'CANCELED' THEN 'FEITO'
        ELSE status
      END,
      updated_at = datetime('now')
    WHERE status IN ('PENDING', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'PAGO', 'CANCELED')
  `
  ).run();
}

async function listOrders(filters: QueryFilters, limit = 200): Promise<Row[]> {
  normalizeLegacyOrderStatuses();

  const db = getDb();
  ensureOrderPaymentSchema(db);
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (filters.status && ORDER_STATUS_VALUES.includes(filters.status as OrderStatus)) {
    where.push("o.status = ?");
    params.push(filters.status);
  }

  const sql = `
    SELECT
      o.id as id,
      o.created_at as createdAt,
      o.status as status,
      c.name as customerName,
      o.notes as notes,
      o.payment_method as paymentMethod,
      c.street as customerStreet,
      c.number as customerNumber,
      c.neighborhood as customerNeighborhood,
      c.city as customerCity,
      c.uf as customerUf,
      c.cep as customerCep,
      (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as itemsCount,
      (
        SELECT COALESCE(SUM(oi.quantity * COALESCE(oi.unit_price, 0)), 0)
        FROM order_items oi
        WHERE oi.order_id = o.id
      ) as totalAmount
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY o.created_at DESC
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(...params, limit) as Array<{
    id: number;
    createdAt: string;
    status: string;
    customerName: string;
    notes: string | null;
    paymentMethod: string;
    customerStreet: string | null;
    customerNumber: string | null;
    customerNeighborhood: string | null;
    customerCity: string | null;
    customerUf: string | null;
    customerCep: string | null;
    itemsCount: number;
    totalAmount: number;
  }>;

  const { byOrderId: fiscalByOrderId, available: fiscalAvailable } = await loadFiscalInvoicesByOrderId(
    rows.map((row) => row.id)
  );

  const filtered = rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    status: normalizeOrderStatus(row.status) as OrderStatus,
    customerName: row.customerName,
    notes: row.notes,
    itemsCount: row.itemsCount,
    totalAmount: Number(row.totalAmount ?? 0),
    paymentMethod: row.paymentMethod,
    customerAddressOk:
      !!row.customerStreet &&
      !!row.customerNumber &&
      !!row.customerNeighborhood &&
      !!row.customerCity &&
      !!row.customerUf &&
      !!row.customerCep,
    fiscal: fiscalByOrderId.get(row.id) ?? null,
    fiscalAvailable,
  }));

  const { from, to } = resolveDateRange(filters);
  const textFiltered = filters.q ? filtered.filter((row) => matchesOrderQuery(row, filters.q)) : filtered;
  const dateFiltered =
    from || to
      ? textFiltered.filter((row) => isOrderWithinDateRange(row, from, to))
      : textFiltered;

  if (!filters.fiscal) return dateFiltered;

  return dateFiltered.filter((row) => {
    const meta = getFiscalBucket(row.fiscal, row.fiscalAvailable);
    return meta === filters.fiscal;
  });
}

function resolveDateRange(filters: Pick<QueryFilters, "period" | "from" | "to">) {
  if (filters.period === "custom") {
    return { from: filters.from, to: filters.to };
  }

  const today = getSaoPauloDateIso();
  if (filters.period === "today") {
    return { from: today, to: today };
  }
  if (filters.period === "last7") {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 6);
    return { from: getSaoPauloDateIso(date), to: today };
  }
  if (filters.period === "month") {
    const yearMonth = getSaoPauloYearMonth();
    return { from: `${yearMonth}-01`, to: today };
  }
  return { from: filters.from, to: filters.to };
}

function matchesOrderQuery(order: Row, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const created = parseAppDate(order.createdAt);
  const createdIso = created ? getSaoPauloDateIso(created) : "";
  const createdMonth = created ? getSaoPauloYearMonth(created) : "";
  const searchable = [
    order.customerName,
    order.notes ?? "",
    String(order.id),
    `#${order.id}`,
    createdIso,
    createdMonth,
    formatDateTime(order.createdAt),
  ]
    .join(" ")
    .toLowerCase();

  return searchable.includes(q);
}

function isOrderWithinDateRange(order: Row, from: string, to: string) {
  const created = parseAppDate(order.createdAt);
  if (!created) return false;
  const iso = getSaoPauloDateIso(created);
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

function listOrderSearchSuggestions(limit = 120) {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        o.id as id,
        o.created_at as createdAt,
        c.name as customerName
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      ORDER BY o.created_at DESC
      LIMIT ?
    `
    )
    .all(limit) as Array<{ id: number; createdAt: string; customerName: string }>;

  const suggestions = new Set<string>();
  for (const row of rows) {
    suggestions.add(row.customerName);
    suggestions.add(`#${row.id}`);
    const created = parseAppDate(row.createdAt);
    if (created) {
      suggestions.add(getSaoPauloDateIso(created));
      suggestions.add(getSaoPauloYearMonth(created));
    }
  }
  return Array.from(suggestions).slice(0, limit);
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

function getFiscalBucket(fiscal: FiscalInvoiceSummary | null, fiscalAvailable: boolean) {
  if (!fiscalAvailable) return "UNAVAILABLE";
  if (!fiscal) return "NONE";
  if (fiscal.internalStatus === "AUTHORIZED") return "AUTHORIZED";
  if (["READY_TO_ISSUE", "ISSUING"].includes(fiscal.internalStatus)) return "IN_PROGRESS";
  if (["REJECTED", "DENIED", "ERROR"].includes(fiscal.internalStatus)) return "ERROR";
  if (fiscal.internalStatus === "CANCELED") return "CANCELED";
  return "OTHER";
}

function getFiscalStatusMeta(fiscal: FiscalInvoiceSummary | null, fiscalAvailable: boolean) {
  const bucket = getFiscalBucket(fiscal, fiscalAvailable);

  switch (bucket) {
    case "UNAVAILABLE":
      return { label: "Fiscal indisponivel", className: "bg-zinc-200 text-zinc-700" };
    case "NONE":
      return { label: "Sem NF-e", className: "bg-black/[0.05] text-[var(--muted)]" };
    case "AUTHORIZED":
      return { label: "NF-e autorizada", className: "bg-emerald-100 text-emerald-800" };
    case "IN_PROGRESS":
      return { label: "Em emissao", className: "bg-amber-100 text-amber-800" };
    case "ERROR":
      return { label: "Falha fiscal", className: "bg-red-100 text-red-800" };
    case "CANCELED":
      return { label: "NF-e cancelada", className: "bg-zinc-200 text-zinc-700" };
    default:
      return {
        label: fiscal?.internalStatus ?? "Fiscal",
        className: "bg-black/[0.05] text-[var(--muted)]",
      };
  }
}

function hasActiveFiscalInvoice(fiscal: FiscalInvoiceSummary | null) {
  if (!fiscal) return false;
  return !["CANCELED", "DENIED"].includes(fiscal.internalStatus);
}

function summarizeOrders(orders: Row[]) {
  const totalValue = orders.reduce((sum, order) => sum + order.totalAmount, 0);
  const sentCount = orders.filter((order) => order.status === "ENVIADO").length;
  const deliveredCount = orders.filter((order) => order.status === "ENTREGUE").length;

  const statusBars = ORDER_STATUS_VALUES.map((status) => {
    const count = orders.filter((order) => order.status === status).length;
    return { status, count, meta: getOrderStatusMeta(status) };
  });

  const fiscalBars = [
    { key: "AUTHORIZED", label: "Autorizadas", count: orders.filter((order) => getFiscalBucket(order.fiscal, order.fiscalAvailable) === "AUTHORIZED").length },
    { key: "IN_PROGRESS", label: "Em emissao", count: orders.filter((order) => getFiscalBucket(order.fiscal, order.fiscalAvailable) === "IN_PROGRESS").length },
    { key: "NONE", label: "Sem NF-e", count: orders.filter((order) => getFiscalBucket(order.fiscal, order.fiscalAvailable) === "NONE").length },
    { key: "ERROR", label: "Com falha", count: orders.filter((order) => getFiscalBucket(order.fiscal, order.fiscalAvailable) === "ERROR").length },
  ];

  const todayIso = getSaoPauloDateIso();
  const last7Days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${todayIso}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (6 - index));
    const iso = getSaoPauloDateIso(date);
      const dayOrders = orders.filter((order) => {
        const date = parseAppDate(order.createdAt);
        return date ? getSaoPauloDateIso(date) === iso : false;
      });
    return {
      iso,
      label: iso.slice(5),
      count: dayOrders.length,
      value: dayOrders.reduce((sum, order) => sum + order.totalAmount, 0),
    };
  });

  return {
    totalValue,
    sentCount,
    deliveredCount,
    statusBars,
    fiscalBars,
    last7Days,
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

function MiniBarChart(props: { title: string; items: Array<{ label: string; value: number; toneClass: string }> }) {
  const max = Math.max(1, ...props.items.map((item) => item.value));
  return (
    <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
      <h2 className="text-base font-semibold">{props.title}</h2>
      <div className="mt-4 space-y-3">
        {props.items.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>{item.label}</span>
              <span className="font-semibold">{item.value}</span>
            </div>
            <div className="h-2 rounded-full bg-black/[0.06]">
              <div
                className={`h-2 rounded-full ${item.toneClass}`}
                style={{ width: `${(item.value / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function PedidosPage(props: {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    fiscal?: string;
    period?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const sp = (await props.searchParams) ?? {};
  const hasExplicitDateFilter = !!(sp.period || sp.from || sp.to);
  const filters: QueryFilters = {
    q: sp.q?.trim() ?? "",
    status: sp.status?.trim() ?? "",
    fiscal: sp.fiscal?.trim() ?? "",
    period: sp.period?.trim() || (hasExplicitDateFilter ? "" : "today"),
    from: sp.from?.trim() ?? "",
    to: sp.to?.trim() ?? "",
  };

  const orders = await listOrders(filters);
  const suggestions = listOrderSearchSuggestions();
  const summary = summarizeOrders(orders);
  const ambiente = getConfiguredFocusAmbiente();
  const fiscalLabel = ambiente === "producao" ? "P" : "H";
  const fiscalTitle =
    ambiente === "producao" ? "Emite NF-e em produção (usa Focus)" : "Emite NF-e em homologação (usa Focus)";
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="mx-auto w-full max-w-[1560px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pedidos</h1>
          <div className="text-sm text-[var(--muted)]">Acompanhe operacao, faturamento e emissao fiscal.</div>
        </div>
        <Link
          href="/pedidos/novo"
          className="rounded-xl bg-[var(--k2-red-2)] px-4 py-3 text-center text-sm font-semibold text-white"
        >
          + Novo pedido
        </Link>
      </div>

      <form action="/pedidos" method="GET" className="mt-6 rounded-2xl border bg-[var(--card)] p-4 shadow-sm sm:p-5">
        <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(260px,1.5fr)_170px_170px_180px_160px_160px_auto]">
          <input
            name="q"
            list="pedidos-search-suggestions"
            defaultValue={filters.q}
            placeholder="Buscar por cliente, pedido, mês ou data"
            className="rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
          />
          <datalist id="pedidos-search-suggestions">
            {suggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
          <select
            name="status"
            defaultValue={filters.status}
            className="rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
          >
            <option value="">Todos os status</option>
            {ORDER_STATUS_VALUES.map((status) => (
              <option key={status} value={status}>
                {getOrderStatusMeta(status).label}
              </option>
            ))}
          </select>
          <select
            name="fiscal"
            defaultValue={filters.fiscal}
            className="rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
          >
            <option value="">Todo fiscal</option>
            <option value="AUTHORIZED">NF-e autorizada</option>
            <option value="IN_PROGRESS">Em emissao</option>
            <option value="NONE">Sem NF-e</option>
            <option value="ERROR">Com falha</option>
            <option value="CANCELED">Cancelada</option>
            <option value="UNAVAILABLE">Fiscal indisponivel</option>
          </select>
          <select
            name="period"
            defaultValue={filters.period}
            className="rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
          >
            <option value="">Todo período</option>
            <option value="today">Hoje</option>
            <option value="last7">Últimos 7 dias</option>
            <option value="month">Mês atual</option>
            <option value="custom">Período personalizado</option>
          </select>
          <input
            name="from"
            type="date"
            defaultValue={filters.from}
            className="rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
          />
          <input
            name="to"
            type="date"
            defaultValue={filters.to}
            className="rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">Filtrar</button>
            <Link href="/pedidos?period=today" className="rounded-xl border px-4 py-3 text-sm font-semibold">
              Limpar
            </Link>
          </div>
        </div>
      </form>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pedidos filtrados" value={String(orders.length)} sub="Resultado atual da busca" />
        <StatCard label="Valor total" value={money.format(summary.totalValue)} sub="Soma dos pedidos listados" />
        <StatCard label="Pedidos enviados" value={String(summary.sentCount)} sub="Em rota ou a caminho" />
        <StatCard label="Pedidos entregues" value={String(summary.deliveredCount)} sub="Prontos no ciclo logistico" />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_1fr_1fr]">
        <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Volume dos ultimos 7 dias</h2>
            <div className="text-xs text-[var(--muted)]">Pedidos e valor por dia</div>
          </div>
          <div className="mt-5 grid grid-cols-7 gap-3">
            {summary.last7Days.map((day) => {
              const maxCount = Math.max(1, ...summary.last7Days.map((entry) => entry.count));
              return (
                <div key={day.iso} className="flex flex-col items-center">
                  <div className="flex h-40 w-full items-end justify-center rounded-2xl bg-black/[0.03] p-2">
                    <div
                      className="w-full rounded-xl bg-[var(--k2-red-2)]"
                      style={{ height: `${(day.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs font-semibold">{day.label}</div>
                  <div className="text-xs text-[var(--muted)]">{day.count}</div>
                  <div className="mt-1 text-center text-[11px] text-[var(--muted)]">
                    {money.format(day.value)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <MiniBarChart
          title="Pedidos por status"
          items={summary.statusBars.map((item) => ({
            label: item.meta.label,
            value: item.count,
            toneClass: item.meta.className.split(" ")[0].replace("text-", "bg-"),
          }))}
        />

        <MiniBarChart
          title="Situacao fiscal"
          items={summary.fiscalBars.map((item) => ({
            label: item.label,
            value: item.count,
            toneClass:
              item.key === "AUTHORIZED"
                ? "bg-emerald-500"
                : item.key === "IN_PROGRESS"
                  ? "bg-amber-500"
                  : item.key === "ERROR"
                    ? "bg-red-500"
                    : "bg-zinc-500",
          }))}
        />
      </section>

      <div className="mt-6 overflow-x-auto rounded-2xl border bg-[var(--card)] shadow-sm">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Itens</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Pagamento</th>
              <th className="px-4 py-3">Criado em</th>
              <th className="px-4 py-3">Fiscal</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-t align-top">
                <td className="px-4 py-3 font-medium">#{order.id}</td>
                <td className="px-4 py-3">{order.customerName}</td>
                <td className="px-4 py-3">{order.itemsCount}</td>
                <td className="px-4 py-3 font-semibold">{money.format(order.totalAmount)}</td>
                <td className="px-4 py-3">
                  <div className="space-y-2">
                    <span
                      className={[
                        "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                        getOrderStatusMeta(order.status).className,
                      ].join(" ")}
                    >
                      {getOrderStatusMeta(order.status).label}
                    </span>
                    <form action={updateOrderStatusAction.bind(null, order.id)} className="flex flex-wrap gap-2">
                      <select
                        name="status"
                        defaultValue={order.status}
                        className="rounded-lg border bg-[var(--card)] px-3 py-1.5 text-xs font-semibold"
                      >
                        {ORDER_STATUS_VALUES.map((status) => (
                          <option key={status} value={status}>
                            {getOrderStatusMeta(status).label}
                          </option>
                        ))}
                      </select>
                      <button className="rounded-lg border px-3 py-1.5 text-xs font-semibold">Salvar</button>
                    </form>
                  </div>
                </td>
                <td className="px-4 py-3">{getOrderPaymentMethodLabel(order.paymentMethod)}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{formatDateTime(order.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="space-y-2">
                    <div>
                      <span
                        className={[
                          "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                          getFiscalStatusMeta(order.fiscal, order.fiscalAvailable).className,
                        ].join(" ")}
                      >
                        {getFiscalStatusMeta(order.fiscal, order.fiscalAvailable).label}
                      </span>
                      {order.fiscal ? (
                        <div className="mt-1 text-[11px] text-[var(--muted)]">
                          {order.fiscal.serie}/{order.fiscal.numero ?? "-"}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/pedidos/${order.id}/imprimir`}
                        target="_blank"
                        className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                      >
                        Reimprimir
                      </Link>
                      <form action="/api/fiscal/orders/preview-danfe" method="post">
                        <input type="hidden" name="orderId" value={order.id} />
                        <button className="rounded-lg border px-3 py-1.5 text-xs font-semibold">
                          Preview DANFE
                        </button>
                      </form>
                      {hasActiveFiscalInvoice(order.fiscal) ? (
                        <Link
                          href={`/nota-fiscal?invoiceId=${encodeURIComponent(order.fiscal!.invoiceId)}`}
                          className="rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Ver NF-e
                        </Link>
                      ) : (
                        <IssueInvoiceButton
                          orderId={order.id}
                          disabled={!order.customerAddressOk}
                          title={
                            order.customerAddressOk
                              ? fiscalTitle
                              : "Cliente sem endereço completo (logradouro/número/bairro/cidade/UF/CEP)"
                          }
                          label={`Emitir NF-e (${fiscalLabel})`}
                        />
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            {orders.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-[var(--muted)]" colSpan={8}>
                  Nenhum pedido encontrado com os filtros atuais.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
