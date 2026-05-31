"use server";

import { randomUUID } from "node:crypto";

import { z } from "zod";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db";

const itemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().finite().positive(),
  unitPrice: z.number().finite().nonnegative().optional(),
});

const createSchema = z.object({
  customerId: z.string().min(1),
  notes: z.string().optional(),
  itemsJson: z.string().min(2),
});

export async function createOrderAction(formData: FormData) {
  const parsed = createSchema.parse({
    customerId: formData.get("customerId"),
    notes: formData.get("notes")?.toString(),
    itemsJson: formData.get("itemsJson")?.toString(),
  });

  const items = z.array(itemSchema).parse(JSON.parse(parsed.itemsJson));
  if (items.length === 0) throw new Error("Inclua ao menos 1 item.");

  const db = getDb();
  const run = db.transaction(() => {
    const result = db
      .prepare("INSERT INTO orders (customer_id, status, notes) VALUES (?, 'PENDING', ?)")
      .run(parsed.customerId, parsed.notes ?? null);

    const orderId = Number(result.lastInsertRowid);

    const insertItem = db.prepare(
      "INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?)"
    );
    const updateStock = db.prepare(
      "UPDATE products SET stock_qty = stock_qty - ?, updated_at = datetime('now') WHERE id = ?"
    );
    const getStock = db.prepare("SELECT stock_qty as stockQty FROM products WHERE id = ?");
    const insertMove = db.prepare(
      `
      INSERT INTO stock_movements
        (id, product_id, type, quantity, unit_cost, reason_code, note, reason, order_id, production_order_id, purchase_invoice_id, meta_json, created_at)
      VALUES
        (?, ?, 'OUT', ?, NULL, ?, ?, ?, ?, NULL, NULL, ?, datetime('now'))
    `
    );
    for (const it of items) {
      const curr = getStock.get(it.productId) as { stockQty: number } | undefined;
      const beforeQty = Number(curr?.stockQty ?? 0);
      const afterQty = beforeQty - it.quantity;
      const note = afterQty < 0 ? `ESTOQUE INSUFICIENTE (antes ${beforeQty.toFixed(3)}, depois ${afterQty.toFixed(3)})` : null;

      insertItem.run(
        randomUUID(),
        orderId,
        it.productId,
        it.quantity,
        typeof it.unitPrice === "number" ? it.unitPrice : null
      );

      // Pedido baixa estoque
      updateStock.run(it.quantity, it.productId);
      insertMove.run(
        randomUUID(),
        it.productId,
        it.quantity,
        "SALE",
        note,
        "SALE",
        orderId,
        JSON.stringify({ unitPrice: it.unitPrice ?? null, stockBefore: beforeQty, stockAfter: afterQty })
      );
    }

    // Criar um recebível (boleto) opcional com vencimento em 7 dias (valor = soma).
    const amount = items.reduce((acc, it) => acc + (it.unitPrice ?? 0) * it.quantity, 0);
    if (amount > 0) {
      const due = new Date();
      due.setDate(due.getDate() + 7);
      db.prepare(
        "INSERT INTO receivables (id, customer_id, order_id, status, method, amount, due_date) VALUES (?, ?, ?, 'OPEN', 'BOLETO', ?, ?)"
      ).run(randomUUID(), parsed.customerId, orderId, amount, due.toISOString());
    }

    return orderId;
  });

  const orderId = run();
  redirect(`/pedidos/${orderId}/imprimir`);
}
