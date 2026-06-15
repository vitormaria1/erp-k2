import Link from "next/link";
import { notFound } from "next/navigation";

import { ensureProductSchema } from "@/lib/catalog-schema";
import { getDb } from "@/lib/db";
import type { ProductOpt } from "@/app/(app)/pedidos/novo/order-items-client";
import { OrderItemsClient } from "@/app/(app)/pedidos/novo/order-items-client";
import { PaymentFieldsClient } from "@/app/(app)/pedidos/novo/payment-fields-client";

import { loadEditableOrder } from "../../edit-order";
import { updateOrderAction } from "./actions";

function getProducts() {
  const db = getDb();
  ensureProductSchema(db);

  try {
    return db
      .prepare(
        "SELECT id, description, reference, unit, price, \"Preco Venda\" as salePriceRaw FROM products WHERE active = TRUE AND kind = 'PRODUTO' ORDER BY description"
      )
      .all() as ProductOpt[];
  } catch {
    return db
      .prepare(
        "SELECT id, description, id as reference, 'UN' as unit, NULL as price, NULL as salePriceRaw FROM products WHERE active = TRUE AND kind = 'PRODUTO' ORDER BY description"
      )
      .all() as ProductOpt[];
  }
}

export default async function EditarPedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const data = loadEditableOrder(id);
  if (!data) notFound();

  const products = getProducts();
  const formId = `edit-order-form-${id}`;
  const customerLabel = data.order.customerTradeName
    ? `${data.order.customerTradeName} (${data.order.customerName})`
    : data.order.customerName;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Editar orçamento</h1>
          <div className="mt-1 text-sm text-[var(--muted)]">
            Atualize produtos, quantidades e preços do orçamento já criado.
          </div>
        </div>
        <Link href="/pedidos" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
          Voltar para orçamentos
        </Link>
      </div>

      {data.editBlockReason ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          {data.editBlockReason}
        </div>
      ) : null}

      <form id={formId} action={updateOrderAction.bind(null, id)} className="mt-6 space-y-4 rounded-2xl border bg-[var(--card)] p-5">
        <input type="hidden" name="customerId" value={data.order.customerId} />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1">
            <div className="text-sm font-semibold">Cliente</div>
            <div className="rounded-xl border bg-black/[0.03] px-4 py-3 text-sm">
              <div className="font-semibold">{customerLabel}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">Código {data.order.customerCode ?? "-"}</div>
            </div>
          </label>

          <PaymentFieldsClient
            formId={formId}
            initialPaymentMethod={data.order.paymentMethod}
            initialDueDate={data.dueDate || undefined}
            initialInstallments={data.installments}
          />

          <label className="space-y-1">
            <div className="text-sm font-semibold">Observações</div>
            <input
              name="notes"
              defaultValue={data.order.notes ?? ""}
              className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
              placeholder="Opcional"
            />
          </label>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-sm font-semibold">Itens</div>
          <div className="mt-2 text-sm text-[var(--muted)]">
            Ajuste os itens existentes, remova linhas ou adicione novos produtos ao orçamento.
          </div>
          <OrderItemsClient products={products} formId={formId} initialItems={data.items} />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={Boolean(data.editBlockReason)}
            className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Salvar alterações
          </button>
          <Link href={`/pedidos/${id}/imprimir`} target="_blank" className="rounded-xl border px-5 py-3 text-sm font-semibold">
            Reimprimir orçamento atual
          </Link>
        </div>
      </form>
    </div>
  );
}
