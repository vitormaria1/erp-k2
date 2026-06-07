import Image from "next/image";
import { notFound } from "next/navigation";

import { PrintButtons, PrintOnLoad } from "./print-client";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/datetime";

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
  customerStreet: string | null;
  customerNumber: string | null;
  customerComplement: string | null;
  customerNeighborhood: string | null;
  customerCity: string | null;
  customerUf: string | null;
  customerCep: string | null;
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
  let order: PrintableOrder | undefined;

  try {
    order = db
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
          c."Nome Rep." as customerSeller,
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
  } catch {
    order = db
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
          NULL as customerSeller,
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
  }

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

  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const created = formatDateTime(order.createdAt);
  const customerAddress = formatCustomerAddress(order);

  return (
    <div className="mx-auto max-w-3xl p-8 print:p-0">
      <PrintOnLoad />
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-4">
          <Image src="/k2-logo.jpeg" alt="K2 Salgados" width={72} height={72} priority />
          <div>
            <div className="text-xl font-extrabold tracking-tight">K2 Salgados</div>
            <div className="text-sm text-black/70">Indústria e Distribuição de Congelados</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-black/70">Pedido</div>
          <div className="text-2xl font-extrabold">#{order.id}</div>
          <div className="text-xs text-black/60">{created}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 rounded-2xl border p-4 md:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-black/60">Cliente</div>
          <div className="text-base font-bold">
            {order.customerTradeName ? order.customerTradeName : order.customerName}
          </div>
          {order.customerTradeName ? (
            <div className="text-sm text-black/70">{order.customerName}</div>
          ) : null}
          {order.customerCnpj ? <div className="text-sm text-black/70">{order.customerCnpj}</div> : null}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-black/60">Código do cliente</div>
            <div className="text-sm">{order.customerCode || "-"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-black/60">Vendedor</div>
            <div className="text-sm">{order.customerSeller || "-"}</div>
          </div>
        </div>
        <div className="md:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-black/60">Endereço</div>
          {customerAddress.length ? (
            customerAddress.map((line) => (
              <div key={line} className="text-sm text-black/70">
                {line}
              </div>
            ))
          ) : (
            <div className="text-sm text-black/70">Endereço não informado.</div>
          )}
        </div>
        {order.notes ? (
          <div className="md:col-span-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-black/60">
              Observações
            </div>
            <div className="text-sm">{order.notes}</div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.03] text-left">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3">Un.</th>
              <th className="px-4 py-3 text-right">Qtd</th>
              <th className="px-4 py-3 text-right">Vlr. unit.</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={`${it.code}-${it.name}`} className="border-t">
                <td className="px-4 py-3 font-semibold">{it.code}</td>
                <td className="px-4 py-3">{it.name}</td>
                <td className="px-4 py-3">{it.unit || "-"}</td>
                <td className="px-4 py-3 text-right">{Number(it.quantity).toFixed(3)}</td>
                <td className="px-4 py-3 text-right">{money.format(Number(it.unitPrice))}</td>
                <td className="px-4 py-3 text-right font-semibold">{money.format(Number(it.total))}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-black/60" colSpan={6}>
                  Pedido sem itens.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-black/60">Conferir e imprimir</div>
        <div className="text-xl font-extrabold">{money.format(grandTotal)}</div>
      </div>

      <PrintButtons />
    </div>
  );
}
