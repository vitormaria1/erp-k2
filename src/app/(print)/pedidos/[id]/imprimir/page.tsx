import Image from "next/image";
import { notFound } from "next/navigation";

import { PrintButtons, PrintOnLoad } from "./print-client";
import { ensureCustomerSchema } from "@/lib/customer-schema";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/datetime";
import { formatOrderCode } from "@/lib/order-format";
import {
  BONIFICACAO_PAYMENT_METHOD,
  ensureOrderPaymentSchema,
  getOrderPaymentMethodLabel,
} from "@/lib/payments";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type ItemRow = {
  code: string;
  name: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
};

type PrintableOrder = {
  id: number;
  createdAt: string;
  notes: string | null;
  customerName: string;
  customerTradeName: string | null;
  customerCode: string | null;
  customerCnpj: string | null;
  customerSeller: string | null;
  paymentMethod: string | null;
  customerStreet: string | null;
  customerNumber: string | null;
  customerComplement: string | null;
  customerNeighborhood: string | null;
  customerCity: string | null;
  customerUf: string | null;
  customerCep: string | null;
};

type OrderPrintCopyProps = {
  order: PrintableOrder;
  items: ItemRow[];
  total: string;
  created: string;
  customerAddress: string[];
  autoNotes: string[];
};

function formatCustomerAddress(order: PrintableOrder) {
  const line1 = [order.customerStreet, order.customerNumber].filter(Boolean).join(", ");
  const line1WithComplement = [line1, order.customerComplement].filter(Boolean).join(" - ");
  const line2 = [order.customerNeighborhood, order.customerCity, order.customerUf].filter(Boolean).join(" - ");
  const line3 = order.customerCep ? `CEP ${order.customerCep}` : "";

  return [line1WithComplement, line2, line3].filter(Boolean);
}

function getOrderPrintable(orderId: number) {
  const db = getDb();
  ensureCustomerSchema(db);
  ensureOrderPaymentSchema(db);
  const order = db
    .prepare(
      `
      SELECT
        o.id as id,
        o.created_at as createdAt,
        o.notes as notes,
        c.name as customerName,
        c.trade_name as customerTradeName,
        c.code as customerCode,
        c.cnpj as customerCnpj,
        c.seller as customerSeller,
        o.payment_method as paymentMethod,
        c.street as customerStreet,
        c.number as customerNumber,
        c.complement as customerComplement,
        c.neighborhood as customerNeighborhood,
        c.city as customerCity,
        c.uf as customerUf,
        c.cep as customerCep
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE o.id = ?
    `
    )
    .get(orderId) as PrintableOrder | undefined;

  if (!order) return null;

  const items = db
    .prepare(
      `
      SELECT
        p.reference as code,
        p.description as name,
        p.unit as unit,
        oi.quantity as quantity,
        COALESCE(oi.unit_price, 0) as unitPrice,
        (COALESCE(oi.unit_price, 0) * oi.quantity) as total
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
      ORDER BY p.description
    `
    )
    .all(orderId) as ItemRow[];

  const grandTotal = items.reduce((acc, it) => acc + (Number(it.total) || 0), 0);
  return { order, items, grandTotal };
}

function OrderPrintCopy({ order, items, total, created, customerAddress, autoNotes }: OrderPrintCopyProps) {
  const shouldCompactItems = items.length > 11;
  const shouldCompactItemsStrongly = items.length > 15;
  const tableClassName = shouldCompactItemsStrongly
    ? "w-full table-fixed text-[9px] leading-tight"
    : shouldCompactItems
      ? "w-full table-fixed text-[10px] leading-tight"
      : "w-full table-fixed text-[11px] leading-tight";
  const headerCellClassName = shouldCompactItems ? "px-2 py-1" : "px-2 py-1.5";
  const bodyCellClassName = shouldCompactItemsStrongly ? "px-2 py-0.5" : shouldCompactItems ? "px-2 py-[3px]" : "px-2 py-1";
  const productNameClassName = shouldCompactItems ? "truncate leading-tight" : "truncate";

  return (
    <div data-print-content className="loading-print-content rounded-xl bg-white">
      <div className="flex items-start justify-between border-b pb-2">
        <div className="flex items-center gap-3">
          <Image src="/k2-logo.jpeg" alt="K2 Salgados" width={52} height={52} priority />
          <div>
            <div className="text-base font-extrabold tracking-tight">
              K2 INDUSTRIA E COMERCIO DE ALIMENTOS LTDA
            </div>
            <div className="text-[11px] text-black/70">Garopaba SC</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-black/60">Orçamento</div>
          <div className="text-xl font-extrabold leading-none">{formatOrderCode(order.id)}</div>
          <div className="mt-1 text-[11px] text-black/60">{created}</div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-[minmax(0,1.5fr)_minmax(180px,1fr)] gap-2 rounded-xl border p-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-black/60">Cliente</div>
          <div className="truncate text-sm font-bold">
            {order.customerName}
          </div>
          {order.customerTradeName ? (
            <div className="truncate text-[11px] text-black/70">{order.customerTradeName}</div>
          ) : null}
          {order.customerCnpj ? <div className="text-[11px] text-black/70">{order.customerCnpj}</div> : null}
        </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] leading-tight">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-black/60">Código</div>
            <div className="font-medium">{order.customerCode || "-"}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-black/60">Vendedor</div>
            <div className="truncate font-medium">{order.customerSeller || "-"}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-black/60">Pagamento</div>
            <div className="truncate font-medium">{getOrderPaymentMethodLabel(order.paymentMethod)}</div>
          </div>
          <div className="col-span-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-black/60">Endereço</div>
            {customerAddress.length ? (
              <div className="text-black/70">{customerAddress.join(" | ")}</div>
            ) : (
              <div className="text-black/70">Endereço não informado.</div>
            )}
          </div>
        </div>
      </div>

      {autoNotes.length > 0 || order.notes ? (
        <div className="mt-2 rounded-xl border p-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-black/60">Observações</div>
          <div className="mt-0.5 space-y-1 text-[11px] leading-tight">
            {autoNotes.map((note) => (
              <div key={note} className="font-semibold">
                {note}
              </div>
            ))}
            {order.notes ? <div>{order.notes}</div> : null}
          </div>
        </div>
      ) : null}

      <div className="mt-2 overflow-hidden rounded-xl border">
        <table className={tableClassName}>
          <thead className="bg-black/[0.03] text-left">
            <tr>
              <th className={`w-[68px] ${headerCellClassName}`}>Código</th>
              <th className={headerCellClassName}>Produto</th>
              <th className={`w-[42px] ${headerCellClassName}`}>Un.</th>
              <th className={`w-[68px] ${headerCellClassName} text-right`}>Qtd</th>
              <th className={`w-[92px] ${headerCellClassName} text-right`}>Vlr. unit.</th>
              <th className={`w-[92px] ${headerCellClassName} text-right`}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={`${it.code}-${it.name}`} className="border-t">
                <td className={`${bodyCellClassName} font-semibold`}>{it.code}</td>
                <td className={bodyCellClassName}>
                  <div className={productNameClassName}>{it.name}</div>
                </td>
                <td className={bodyCellClassName}>{it.unit || "-"}</td>
                <td className={`${bodyCellClassName} text-right`}>{Number(it.quantity).toFixed(3)}</td>
                <td className={`${bodyCellClassName} text-right`}>{money.format(Number(it.unitPrice))}</td>
                <td className={`${bodyCellClassName} text-right font-semibold`}>{money.format(Number(it.total))}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td className="px-2 py-4 text-black/60" colSpan={6}>
                  Orçamento sem itens.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-center justify-end rounded-xl border px-3 py-2">
        <div className="text-lg font-extrabold">{total}</div>
      </div>
    </div>
  );
}

export default async function PrintPedidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();
  const data = getOrderPrintable(id);
  if (!data) notFound();

  const { order, items, grandTotal } = data;

  const created = formatDateTime(order.createdAt);
  const customerAddress = formatCustomerAddress(order);
  const total = money.format(grandTotal);
  const autoNotes =
    order.paymentMethod === BONIFICACAO_PAYMENT_METHOD
      ? ["BONIFICACAO: pedido sem cobranca e sem geracao de recebivel."]
      : [];

  return (
    <>
      <div
        data-print-shell
        className="loading-print-shell mx-auto grid h-[285mm] w-full max-w-[210mm] grid-rows-2 gap-2 p-3 print:h-[285mm] print:w-[190mm] print:p-0"
      >
        <PrintOnLoad />
        <div className="print-copy-slot overflow-hidden rounded-xl border border-dashed border-black/30 p-2">
          <OrderPrintCopy
            order={order}
            items={items}
            total={total}
            created={created}
            customerAddress={customerAddress}
            autoNotes={autoNotes}
          />
        </div>
        <div className="print-copy-slot overflow-hidden rounded-xl border border-dashed border-black/30 p-2">
          <OrderPrintCopy
            order={order}
            items={items}
            total={total}
            created={created}
            customerAddress={customerAddress}
            autoNotes={autoNotes}
          />
        </div>
      </div>
      <div className="mx-auto w-full max-w-[210mm]">
        <PrintButtons />
      </div>
    </>
  );
}
