import Image from "next/image";
import { notFound } from "next/navigation";

import { PrintButtons, PrintOnLoad } from "@/app/(print)/pedidos/[id]/imprimir/print-client";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/datetime";

type ProductRow = {
  reference: string;
  description: string;
  unit: string;
  quantity: number;
};

type InputRow = {
  reference: string;
  description: string;
  unit: string;
  totalQuantity: number;
};

function getPrintable(productionOrderId: string) {
  const db = getDb();
  const po = db
    .prepare("SELECT id, notes, created_at as createdAt FROM production_orders WHERE id = ?")
    .get(productionOrderId) as { id: string; notes: string | null; createdAt: string } | undefined;
  if (!po) return null;

  const products = db
    .prepare(
      `
      SELECT
        p.reference as reference,
        p.description as description,
        p.unit as unit,
        pop.quantity as quantity
      FROM production_order_products pop
      JOIN products p ON p.id = pop.product_id
      WHERE pop.production_order_id = ?
      ORDER BY CAST(p.reference AS INTEGER) ASC, p.reference ASC
    `
    )
    .all(productionOrderId) as ProductRow[];

  const inputs = db
    .prepare(
      `
      SELECT
        p.reference as reference,
        p.description as description,
        p.unit as unit,
        poi.total_quantity as totalQuantity
      FROM production_order_inputs poi
      JOIN products p ON p.id = poi.input_product_id
      WHERE poi.production_order_id = ?
      ORDER BY CAST(p.reference AS INTEGER) ASC, p.reference ASC
    `
    )
    .all(productionOrderId) as InputRow[];

  return { po, products, inputs };
}

function formatKg(value: number) {
  const fmt = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 3,
  });
  return fmt.format(value);
}

export default async function PrintProducaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = getPrintable(id);
  if (!data) notFound();

  const created = formatDateTime(data.po.createdAt);

  return (
    <div className="mx-auto max-w-3xl p-8 print:p-0">
      <PrintOnLoad />

      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-4">
          <Image src="/k2-logo.jpeg" alt="K2 Salgados" width={72} height={72} priority />
          <div>
            <div className="text-xl font-extrabold tracking-tight">K2 Salgados</div>
            <div className="text-sm text-black/70">Ordem de Produção (lista de insumos)</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-black/70">Criado em</div>
          <div className="text-sm font-bold">{created}</div>
          <div className="text-xs text-black/60 break-all">{data.po.id}</div>
        </div>
      </div>

      {data.po.notes ? (
        <div className="mt-4 rounded-2xl border p-4 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-black/60">
            Observações
          </div>
          <div className="mt-1">{data.po.notes}</div>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border p-4">
        <div className="text-sm font-extrabold">Produtos a produzir</div>
        <div className="mt-3 overflow-hidden rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.03] text-left">
              <tr>
                <th className="px-4 py-3">Ref.</th>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3 text-right">Qtd</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((p) => (
                <tr key={p.reference} className="border-t">
                  <td className="px-4 py-3 font-semibold">{p.reference}</td>
                  <td className="px-4 py-3">{p.description}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {p.unit.trim().toUpperCase() === "KG" ? formatKg(p.quantity) : p.quantity} {p.unit}
                  </td>
                </tr>
              ))}
              {data.products.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-black/60" colSpan={3}>
                    Nenhum produto.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.03] text-left">
            <tr>
              <th className="px-4 py-3">Ref.</th>
              <th className="px-4 py-3">Insumo</th>
              <th className="px-4 py-3 text-right">Total (KG)</th>
            </tr>
          </thead>
          <tbody>
            {data.inputs.map((it) => (
              <tr key={it.reference} className="border-t">
                <td className="px-4 py-3 font-semibold">{it.reference}</td>
                <td className="px-4 py-3">
                  {it.description}
                  <div className="text-xs text-black/60">{it.unit}</div>
                </td>
                <td className="px-4 py-3 text-right font-semibold">
                  {formatKg(Number(it.totalQuantity))} KG
                </td>
              </tr>
            ))}
            {data.inputs.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-black/60" colSpan={3}>
                  Nenhum insumo calculado. Verifique se os produtos têm composição cadastrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <PrintButtons />
    </div>
  );
}
