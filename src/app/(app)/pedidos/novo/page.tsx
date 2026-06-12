import Link from "next/link";

import { getDb } from "@/lib/db";
import { ensureProductSchema } from "@/lib/catalog-schema";
import { ensureCustomerSchema } from "@/lib/customer-schema";
import { OrderItemsClient, type ProductOpt } from "./order-items-client";
import { CustomerSelectClient, type CustomerOpt } from "./customer-select-client";
import { EmitInvoiceSubmitClient } from "./emit-invoice-submit-client";
import { PaymentFieldsClient } from "./payment-fields-client";

function getOptions() {
  const db = getDb();
  ensureCustomerSchema(db);
  ensureProductSchema(db);
  let customers: CustomerOpt[];
  let products: ProductOpt[];

  try {
    customers = db
      .prepare("SELECT id, name, trade_name as tradeName, code, cnpj FROM customers WHERE active = TRUE ORDER BY name")
      .all() as CustomerOpt[];
  } catch {
    customers = db
      .prepare("SELECT id, name, NULL as tradeName, code, NULL as cnpj FROM customers WHERE active = TRUE ORDER BY name")
      .all() as CustomerOpt[];
  }

  try {
    products = db
      .prepare("SELECT id, description, reference, unit, price, \"Preco Venda\" as salePriceRaw FROM products WHERE active = TRUE AND kind = 'PRODUTO' ORDER BY description")
      .all() as ProductOpt[];
  } catch {
    products = db
      .prepare("SELECT id, description, id as reference, 'UN' as unit, NULL as price, NULL as salePriceRaw FROM products WHERE active = TRUE AND kind = 'PRODUTO' ORDER BY description")
      .all() as ProductOpt[];
  }

  return { customers, products };
}

export default function NovoPedidoPage() {
  const { customers, products } = getOptions();
  const formId = "new-order-form";
  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Novo pedido</h1>
          <div className="mt-1 text-sm text-[var(--muted)]">
            Selecione o cliente, monte os itens e crie o pedido.
          </div>
        </div>
        <Link href="/pedidos" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
          Voltar para pedidos
        </Link>
      </div>

      <form id={formId} className="mt-6 space-y-4 rounded-2xl border bg-[var(--card)] p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1">
            <div className="text-sm font-semibold">Cliente</div>
            <CustomerSelectClient customers={customers} inputName="customerId" formId={formId} />
          </label>
          <PaymentFieldsClient formId={formId} />
          <label className="space-y-1">
            <div className="text-sm font-semibold">Observações</div>
            <input
              name="notes"
              className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
              placeholder="Opcional"
            />
          </label>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-sm font-semibold">Itens</div>
          <div className="mt-2 text-sm text-[var(--muted)]">
            Os produtos ficam carregados em uma lista compacta com rolagem e busca imediata.
          </div>
          <OrderItemsClient products={products} formId={formId} />
        </div>

        <EmitInvoiceSubmitClient formId={formId} />
      </form>
    </div>
  );
}
