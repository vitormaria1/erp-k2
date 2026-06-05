import { createOrderAction } from "./actions";

import { getDb } from "@/lib/db";
import { OrderItemsClient, type ProductOpt } from "./order-items-client";
import { CustomerSelectClient, type CustomerOpt } from "./customer-select-client";

function getOptions() {
  const db = getDb();
  let customers: CustomerOpt[];
  let products: ProductOpt[];

  try {
    customers = db
      .prepare("SELECT id, name, trade_name as tradeName, code, cnpj FROM customers ORDER BY name")
      .all() as CustomerOpt[];
  } catch {
    customers = db
      .prepare("SELECT id, name, NULL as tradeName, code, NULL as cnpj FROM customers ORDER BY name")
      .all() as CustomerOpt[];
  }

  try {
    products = db
      .prepare("SELECT id, description, reference, unit FROM products ORDER BY description")
      .all() as ProductOpt[];
  } catch {
    products = db
      .prepare("SELECT id, description, id as reference, 'UN' as unit FROM products ORDER BY description")
      .all() as ProductOpt[];
  }

  return { customers, products };
}

export default function NovoPedidoPage() {
  const { customers, products } = getOptions();
  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <h1 className="text-2xl font-semibold">Novo pedido</h1>
      <div className="mt-1 text-sm text-[var(--muted)]">
        MVP: selecione cliente, adicione itens e crie o pedido.
      </div>

      <form action={createOrderAction} className="mt-6 space-y-4 rounded-2xl border bg-[var(--card)] p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <div className="text-sm font-semibold">Cliente</div>
            <CustomerSelectClient customers={customers} inputName="customerId" />
          </label>
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
            Por enquanto, adicione 1 item por vez e clique em “Adicionar”.
          </div>
          <OrderItemsClient products={products} />
        </div>

        <button className="rounded-xl bg-[var(--k2-red-2)] px-5 py-3 text-sm font-semibold text-white">
          Criar pedido
        </button>
      </form>
    </div>
  );
}
