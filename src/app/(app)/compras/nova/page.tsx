import Link from "next/link";

import { getDb } from "@/lib/db";
import { createPurchaseInvoiceAction } from "./actions";
import { PurchaseItemsClient, type ProductOpt } from "./purchase-items-client";

const PRODUCT_REFERENCE_ORDER_SQL =
  "CASE WHEN NULLIF(BTRIM(reference), '') ~ '^[0-9]+$' THEN reference::bigint END NULLS LAST, reference ASC";

function listProducts(): ProductOpt[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT id, reference, description, unit
      FROM products
      ORDER BY ${PRODUCT_REFERENCE_ORDER_SQL}
    `
    )
    .all() as ProductOpt[];
}

export default function NovaCompraPage() {
  const products = listProducts();
  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-sm text-[var(--muted)]">Compras</div>
          <h1 className="text-2xl font-semibold">Entrada de nota (manual)</h1>
        </div>
        <Link href="/compras" className="rounded-xl border bg-[var(--card)] px-4 py-3 text-sm font-semibold">
          Voltar
        </Link>
      </div>

      <form action={createPurchaseInvoiceAction} className="mt-6 space-y-4 rounded-2xl border bg-[var(--card)] p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="block space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Fornecedor</div>
            <input
              name="supplierName"
              className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
              placeholder="Opcional"
            />
          </label>
          <label className="block space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Nº da nota</div>
            <input
              name="number"
              className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
              placeholder="Opcional"
            />
          </label>
          <label className="block space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Data emissão</div>
            <input
              name="issuedAt"
              type="date"
              className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
            />
          </label>
        </div>

        <label className="block space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Observações</div>
          <input name="notes" className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm" placeholder="Opcional" />
        </label>

        <div className="rounded-2xl border bg-black/[0.02] p-4">
          <div className="text-sm font-semibold">Itens da nota</div>
          <div className="mt-1 text-sm text-[var(--muted)]">
            Cada item faz <span className="font-semibold">entrada no estoque</span> e atualiza o <span className="font-semibold">custo</span> do produto/insumo.
          </div>
          <PurchaseItemsClient products={products} />
        </div>

        <button className="rounded-xl bg-[var(--k2-red-2)] px-5 py-3 text-sm font-semibold text-white">
          Lançar nota (entrada no estoque)
        </button>
      </form>
    </div>
  );
}
