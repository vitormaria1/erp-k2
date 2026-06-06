import Link from "next/link";

import { getDb } from "@/lib/db";
import { parseAppDate } from "@/lib/datetime";
import { formatDateTime, getSaoPauloDateIso } from "@/lib/datetime";
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
  itemsCount: number;
  totalAmount: number;
  customerAddressOk: boolean;
  fiscal: FiscalInvoiceSummary | null;
  fiscalAvailable: boolean;
};

type QueryFilters = {
  q: string;
  status: string;
  fiscal: string;
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
        WHEN status = 'CANCELED' THEN 'FEITO'
        ELSE status
      END,
      updated_at = datetime('now')
    WHERE status IN ('PENDING', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'CANCELED')
  `
  ).run();
}

async function listOrders(filters: QueryFilters, limit = 200): Promise<Row[]> {
  normalizeLegacyOrderStatuses();

  const db = getDb();
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (filters.q) {
    where.push("(c.name LIKE ? OR CAST(o.id AS TEXT) LIKE ? OR COALESCE(o.notes, '') LIKE ?)");
    params.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`);
  }

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
    itemsCount: row.itemsCount,
    totalAmount: Number(row.totalAmount ?? 0),
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

  if (!filters.fiscal) return filtered;

  return filtered.filter((row) => {
    const meta = getFiscalBucket(row.fiscal, row.fiscalAvailable);
    return meta === filters.fiscal;
  });
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
  const paidCount = orders.filter((order) => order.status === "PAGO").length;
  const deliveredCount = orders.filter((order) => order.status === "ENTREGUE").length;
  const authorizedCount = orders.filter((order) => order.fiscal?.internalStatus === "AUTHORIZED").length;
  const pendingFiscalCount = orders.filter((order) => !order.fiscal).length;

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
    paidCount,
    deliveredCount,
    authorizedCount,
    pendingFiscalCount,
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
  searchParams?: Promise<{ q?: string; status?: string; fiscal?: string }>;
}) {
  const sp = (await props.searchParams) ?? {};
  const filters: QueryFilters = {
    q: sp.q?.trim() ?? "",
    status: sp.status?.trim() ?? "",
    fiscal: sp.fiscal?.trim() ?? "",
  };

  const orders = await listOrders(filters);
  const summary = summarizeOrders(orders);
  const ambiente = getConfiguredFocusAmbiente();
  const fiscalLabel = ambiente === "producao" ? "P" : "H";
  const fiscalTitle =
    ambiente === "producao" ? "Emite NF-e em produção (usa Focus)" : "Emite NF-e em homologação (usa Focus)";
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
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

      <form action="/pedidos" method="GET" className="mt-6 rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_220px_220px_auto]">
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Buscar por cliente, numero do pedido ou observacao"
            className="rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
          />
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
          <div className="flex gap-2">
            <button className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">Filtrar</button>
            <Link href="/pedidos" className="rounded-xl border px-4 py-3 text-sm font-semibold">
              Limpar
            </Link>
          </div>
        </div>
      </form>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Pedidos filtrados" value={String(orders.length)} sub="Resultado atual da busca" />
        <StatCard label="Valor total" value={money.format(summary.totalValue)} sub="Soma dos pedidos listados" />
        <StatCard label="Pedidos pagos" value={String(summary.paidCount)} sub="Status operacional pago" />
        <StatCard label="Pedidos entregues" value={String(summary.deliveredCount)} sub="Prontos no ciclo logistico" />
        <StatCard label="NF-e autorizadas" value={String(summary.authorizedCount)} sub={`${summary.pendingFiscalCount} ainda sem NF-e`} />
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

      <div className="mt-6 overflow-hidden rounded-2xl border bg-[var(--card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Itens</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Status</th>
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
                <td className="px-4 py-8 text-[var(--muted)]" colSpan={7}>
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
