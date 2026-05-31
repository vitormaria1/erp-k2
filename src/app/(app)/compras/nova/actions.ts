"use server";

import { randomUUID } from "node:crypto";

import { z } from "zod";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db";
import { propagateCostFromInput } from "@/lib/inventory";

const itemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().finite().positive(),
  unitCost: z.coerce.number().finite().nonnegative(),
});

const createSchema = z.object({
  supplierName: z.string().optional(),
  number: z.string().optional(),
  issuedAt: z.string().optional(),
  notes: z.string().optional(),
  itemsJson: z.string().min(2),
});

export async function createPurchaseInvoiceAction(formData: FormData) {
  const parsed = createSchema.parse({
    supplierName: formData.get("supplierName")?.toString(),
    number: formData.get("number")?.toString(),
    issuedAt: formData.get("issuedAt")?.toString(),
    notes: formData.get("notes")?.toString(),
    itemsJson: formData.get("itemsJson")?.toString(),
  });

  const items = z.array(itemSchema).parse(JSON.parse(parsed.itemsJson));
  if (items.length === 0) throw new Error("Inclua ao menos 1 item na nota.");

  const db = getDb();
  const purchaseInvoiceId = randomUUID();

  const touched = new Set<string>();

  const run = db.transaction(() => {
    db.prepare(
      "INSERT INTO purchase_invoices (id, supplier_name, number, issued_at, status, notes) VALUES (?, ?, ?, ?, 'POSTED', ?)"
    ).run(
      purchaseInvoiceId,
      parsed.supplierName?.trim() || null,
      parsed.number?.trim() || null,
      parsed.issuedAt?.trim() ? new Date(parsed.issuedAt).toISOString() : null,
      parsed.notes?.trim() || null
    );

    const insertItem = db.prepare(
      "INSERT INTO purchase_invoice_items (id, purchase_invoice_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?, ?)"
    );
    const getCurrent = db.prepare("SELECT stock_qty as stockQty, cost as cost FROM products WHERE id = ?");
    const updStockCost = db.prepare(
      "UPDATE products SET stock_qty = ?, cost = ?, updated_at = datetime('now') WHERE id = ?"
    );
    const insertMove = db.prepare(
      `
      INSERT INTO stock_movements
        (id, product_id, type, quantity, unit_cost, reason_code, note, reason, order_id, production_order_id, purchase_invoice_id, meta_json, created_at)
      VALUES
        (?, ?, 'IN', ?, ?, ?, ?, ?, NULL, NULL, ?, ?, datetime('now'))
    `
    );

    for (const it of items) {
      insertItem.run(randomUUID(), purchaseInvoiceId, it.productId, it.quantity, it.unitCost);

      // Custo médio ponderado (evita "pular" custo por uma compra pontual)
      const curr = getCurrent.get(it.productId) as { stockQty: number; cost: number | null } | undefined;
      const currQty = Number(curr?.stockQty ?? 0);
      const baseQty = currQty > 0 ? currQty : 0;
      const baseCost = typeof curr?.cost === "number" ? Number(curr.cost) : it.unitCost;
      const nextQty = currQty + it.quantity;
      const nextCost =
        baseQty + it.quantity > 0
          ? (baseCost * baseQty + it.unitCost * it.quantity) / (baseQty + it.quantity)
          : it.unitCost;

      updStockCost.run(nextQty, nextCost, it.productId);
      insertMove.run(
        randomUUID(),
        it.productId,
        it.quantity,
        it.unitCost,
        "PURCHASE",
        null,
        "PURCHASE",
        purchaseInvoiceId,
        JSON.stringify({ supplierName: parsed.supplierName ?? null, number: parsed.number ?? null })
      );
      touched.add(it.productId);
    }
  });

  run();

  // Atualiza custos de produtos finais que dependem dos insumos comprados
  for (const pid of touched) propagateCostFromInput(pid);

  redirect("/compras");
}
