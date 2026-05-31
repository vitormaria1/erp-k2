"use server";

import { z } from "zod";

import { getDb } from "@/lib/db";
import { propagateCostFromInput, recalcProductCost } from "@/lib/inventory";

const addSchema = z.object({
  productId: z.string().min(1),
  inputProductId: z.string().min(1),
  quantity: z.coerce.number().finite().positive(),
});

export async function addRecipeItemAction(formData: FormData) {
  const parsed = addSchema.parse({
    productId: formData.get("productId"),
    inputProductId: formData.get("inputProductId"),
    quantity: formData.get("quantity"),
  });
  if (parsed.productId === parsed.inputProductId) throw new Error("Produto e insumo não podem ser iguais.");

  const db = getDb();
  const input = db
    .prepare("SELECT unit FROM products WHERE id = ?")
    .get(parsed.inputProductId) as { unit: string } | undefined;
  if (!input) throw new Error("Insumo não encontrado.");
  if ((input.unit ?? "").toUpperCase() !== "KG") {
    throw new Error("Para a Ordem de Produção, a receita aceita apenas insumos com unidade KG.");
  }
  db.prepare(
    `
    INSERT INTO product_recipes (product_id, input_product_id, quantity)
    VALUES (?, ?, ?)
    ON CONFLICT(product_id, input_product_id) DO UPDATE SET quantity=excluded.quantity
  `
  ).run(parsed.productId, parsed.inputProductId, parsed.quantity);

  recalcProductCost(parsed.productId);
  propagateCostFromInput(parsed.productId);
}

const removeSchema = z.object({
  productId: z.string().min(1),
  inputProductId: z.string().min(1),
});

export async function removeRecipeItemAction(formData: FormData) {
  const parsed = removeSchema.parse({
    productId: formData.get("productId"),
    inputProductId: formData.get("inputProductId"),
  });
  const db = getDb();
  db.prepare("DELETE FROM product_recipes WHERE product_id = ? AND input_product_id = ?").run(
    parsed.productId,
    parsed.inputProductId
  );

  recalcProductCost(parsed.productId);
  propagateCostFromInput(parsed.productId);
}
