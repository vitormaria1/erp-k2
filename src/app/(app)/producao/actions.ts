"use server";

import { randomUUID } from "node:crypto";

import { z } from "zod";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db";

const itemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().finite().positive(),
});

const createSchema = z.object({
  notes: z.string().optional(),
  itemsJson: z.string().min(2),
});

export async function createProductionOrderAction(formData: FormData) {
  const parsed = createSchema.parse({
    notes: formData.get("notes")?.toString(),
    itemsJson: formData.get("itemsJson")?.toString(),
  });
  const items = z.array(itemSchema).parse(JSON.parse(parsed.itemsJson));
  if (items.length === 0) throw new Error("Inclua ao menos 1 produto para produzir.");

  // Merge duplicates
  const byProduct = new Map<string, number>();
  for (const it of items) {
    byProduct.set(it.productId, (byProduct.get(it.productId) ?? 0) + Number(it.quantity));
  }

  const db = getDb();
  const productionOrderId = randomUUID();

  const run = db.transaction(() => {
    db.prepare("INSERT INTO production_orders (id, notes, status) VALUES (?, ?, 'OPEN')").run(
      productionOrderId,
      parsed.notes ?? null
    );

    const insertProd = db.prepare(
      "INSERT INTO production_order_products (production_order_id, product_id, quantity) VALUES (?, ?, ?)"
    );
    for (const [productId, qty] of byProduct) insertProd.run(productionOrderId, productId, qty);

    // Compute inputs totals based on recipe
    const recipeRows = db
      .prepare(
        `
        SELECT product_id as productId, input_product_id as inputProductId, quantity as perUnit
        FROM product_recipes
        WHERE product_id IN (${Array.from(byProduct.keys())
          .map(() => "?")
          .join(",")})
      `
      )
      .all(...Array.from(byProduct.keys())) as {
      productId: string;
      inputProductId: string;
      perUnit: number;
    }[];

    const totals = new Map<string, number>();
    for (const r of recipeRows) {
      const qty = byProduct.get(r.productId) ?? 0;
      const add = qty * Number(r.perUnit);
      if (!add) continue;
      totals.set(r.inputProductId, (totals.get(r.inputProductId) ?? 0) + add);
    }

    // Garantia: OP sempre em KG (sem mentir). Se algum insumo não for KG, aborta.
    const inputIds = Array.from(totals.keys());
    if (inputIds.length > 0) {
      const placeholders = inputIds.map(() => "?").join(",");
      const bad = db
        .prepare(
          `
          SELECT reference, description, unit
          FROM products
          WHERE id IN (${placeholders}) AND UPPER(unit) != 'KG'
        `
        )
        .all(...inputIds) as { reference: string; description: string; unit: string }[];
      if (bad.length > 0) {
        const msg = bad
          .slice(0, 8)
          .map((b) => `${b.reference} (${b.unit})`)
          .join(", ");
        throw new Error(
          `A OP exige insumos em KG. Ajuste a unidade ou troque o insumo na receita: ${msg}${bad.length > 8 ? "..." : ""}`
        );
      }
    }

    const insertInput = db.prepare(
      "INSERT INTO production_order_inputs (production_order_id, input_product_id, total_quantity) VALUES (?, ?, ?)"
    );
    const consumeStock = db.prepare(
      "UPDATE products SET stock_qty = stock_qty - ?, updated_at = datetime('now') WHERE id = ?"
    );
    const getStock = db.prepare("SELECT stock_qty as stockQty FROM products WHERE id = ?");
    const insertMove = db.prepare(
      `
      INSERT INTO stock_movements
        (id, product_id, type, quantity, unit_cost, reason_code, note, reason, order_id, production_order_id, purchase_invoice_id, meta_json, created_at)
      VALUES
        (?, ?, 'OUT', ?, NULL, ?, ?, ?, NULL, ?, NULL, ?, datetime('now'))
    `
    );
    for (const [inputProductId, totalQty] of totals) {
      insertInput.run(productionOrderId, inputProductId, totalQty);

      // Consumir insumo do estoque automaticamente ao abrir OP
      const curr = getStock.get(inputProductId) as { stockQty: number } | undefined;
      const beforeQty = Number(curr?.stockQty ?? 0);
      const afterQty = beforeQty - totalQty;
      const note = afterQty < 0 ? `ESTOQUE INSUFICIENTE (antes ${beforeQty.toFixed(3)}, depois ${afterQty.toFixed(3)})` : null;
      consumeStock.run(totalQty, inputProductId);
      insertMove.run(
        randomUUID(),
        inputProductId,
        totalQty,
        "PRODUCTION_CONSUME",
        note,
        "PRODUCTION_CONSUME",
        productionOrderId,
        JSON.stringify({ op: productionOrderId, stockBefore: beforeQty, stockAfter: afterQty })
      );
    }
  });

  run();
  redirect(`/producao/${productionOrderId}/imprimir`);
}

export async function completeProductionOrderAction(formData: FormData) {
  const productionOrderId = String(formData.get("productionOrderId") ?? "");
  if (!productionOrderId) throw new Error("Ordem inválida.");

  const db = getDb();
  const run = db.transaction(() => {
    const row = db
      .prepare("SELECT status FROM production_orders WHERE id = ?")
      .get(productionOrderId) as { status: string } | undefined;
    if (!row) throw new Error("Ordem não encontrada.");
    if (row.status === "COMPLETED") return;

    const products = db
      .prepare(
        `
        SELECT product_id as productId, quantity as quantity
        FROM production_order_products
        WHERE production_order_id = ?
      `
      )
      .all(productionOrderId) as { productId: string; quantity: number }[];

    const addStock = db.prepare(
      "UPDATE products SET stock_qty = stock_qty + ?, updated_at = datetime('now') WHERE id = ?"
    );
    const insertMove = db.prepare(
      `
      INSERT INTO stock_movements
        (id, product_id, type, quantity, unit_cost, reason_code, note, reason, order_id, production_order_id, purchase_invoice_id, meta_json, created_at)
      VALUES
        (?, ?, 'IN', ?, NULL, ?, ?, ?, NULL, ?, NULL, ?, datetime('now'))
    `
    );

    for (const p of products) {
      addStock.run(p.quantity, p.productId);
      insertMove.run(
        randomUUID(),
        p.productId,
        p.quantity,
        "PRODUCTION_FINISH",
        null,
        "PRODUCTION_FINISH",
        productionOrderId,
        JSON.stringify({ op: productionOrderId })
      );
    }

    db.prepare("UPDATE production_orders SET status = 'COMPLETED', completed_at = datetime('now') WHERE id = ?").run(
      productionOrderId
    );
  });

  run();
  redirect("/producao");
}

export async function cancelProductionOrderAction(formData: FormData) {
  const productionOrderId = String(formData.get("productionOrderId") ?? "");
  if (!productionOrderId) throw new Error("Ordem inválida.");

  const db = getDb();
  const run = db.transaction(() => {
    const row = db
      .prepare("SELECT status FROM production_orders WHERE id = ?")
      .get(productionOrderId) as { status: string } | undefined;
    if (!row) throw new Error("Ordem não encontrada.");
    if (row.status !== "OPEN") throw new Error("Somente OP em aberto pode ser cancelada.");

    const inputs = db
      .prepare(
        `
        SELECT input_product_id as inputProductId, total_quantity as totalQuantity
        FROM production_order_inputs
        WHERE production_order_id = ?
      `
      )
      .all(productionOrderId) as { inputProductId: string; totalQuantity: number }[];

    const addStock = db.prepare(
      "UPDATE products SET stock_qty = stock_qty + ?, updated_at = datetime('now') WHERE id = ?"
    );
    const insertMove = db.prepare(
      `
      INSERT INTO stock_movements
        (id, product_id, type, quantity, unit_cost, reason_code, note, reason, order_id, production_order_id, purchase_invoice_id, meta_json, created_at)
      VALUES
        (?, ?, 'IN', ?, NULL, ?, ?, ?, NULL, ?, NULL, ?, datetime('now'))
    `
    );

    for (const i of inputs) {
      addStock.run(i.totalQuantity, i.inputProductId);
      insertMove.run(
        randomUUID(),
        i.inputProductId,
        i.totalQuantity,
        "REVERSAL",
        "Cancelamento OP (estorno consumo)",
        "REVERSAL:Cancelamento OP (estorno consumo)",
        productionOrderId,
        JSON.stringify({ op: productionOrderId, kind: "PRODUCTION_CONSUME" })
      );
    }

    db.prepare("UPDATE production_orders SET status = 'CANCELED' WHERE id = ?").run(productionOrderId);
  });

  run();
  redirect("/producao");
}
