"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { applyStockMovement } from "@/lib/inventory";
import { getDb } from "@/lib/db";
import { PRODUCT_EDITABLE_FIELDS } from "@/lib/product-columns";

const adjustSchema = z.object({
  productId: z.string().min(1),
  type: z.enum(["IN", "OUT", "ADJUSTMENT"]),
  quantity: z.coerce.number().finite().positive(),
  reason: z.string().optional(),
});

export async function adjustStockAction(formData: FormData) {
  const parsed = adjustSchema.parse({
    productId: formData.get("productId"),
    type: formData.get("type"),
    quantity: formData.get("quantity"),
    reason: formData.get("reason")?.toString(),
  });

  applyStockMovement({
    productId: parsed.productId,
    type: parsed.type,
    quantity: parsed.quantity,
    reasonCode: "MANUAL",
    note: parsed.reason ?? null,
  });
}

function textValue(formData: FormData, field: string): string | null {
  const value = String(formData.get(field) ?? "").trim();
  return value.length ? value : null;
}

function numberValue(formData: FormData, field: string, fallback: number | null = null): number | null {
  const raw = String(formData.get(field) ?? "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function saveProductAction(formData: FormData) {
  const db = getDb();
  const id = textValue(formData, "id") ?? randomUUID();
  const reference = textValue(formData, "reference");
  const description = textValue(formData, "description");
  const unit = textValue(formData, "unit") ?? "UN";
  const kind = textValue(formData, "kind") ?? "UNKNOWN";

  if (!reference) throw new Error("Informe a referência.");
  if (!description) throw new Error("Informe a descrição.");

  const duplicated = db
    .prepare("SELECT id FROM products WHERE reference = ? AND id != ? LIMIT 1")
    .get(reference, id) as { id: string } | undefined;
  if (duplicated) throw new Error("Já existe um produto com essa referência.");

  const productValues: Record<string, string | number | null> = {
    reference,
    tele_ref: textValue(formData, "tele_ref"),
    barcode: textValue(formData, "barcode"),
    gtin: textValue(formData, "gtin"),
    description,
    composition: textValue(formData, "composition"),
    unit,
    kind,
    price: numberValue(formData, "price"),
    cost: numberValue(formData, "cost"),
    min_stock: numberValue(formData, "min_stock"),
    stock_qty: numberValue(formData, "stock_qty", 0),
  };

  for (const field of PRODUCT_EDITABLE_FIELDS) {
    if (field in productValues) continue;
    productValues[field] = textValue(formData, field);
  }

  const columns = ["id", ...Object.keys(productValues)];
  const placeholders = columns.map(() => "?").join(", ");
  const assignments = Object.keys(productValues).map((column) => `"${column.replace(/"/g, '""')}" = excluded."${column.replace(/"/g, '""')}"`);

  db.prepare(
    `
    INSERT INTO products (${columns.map((column) => `"${column.replace(/"/g, '""')}"`).join(", ")})
    VALUES (${placeholders})
    ON CONFLICT(id) DO UPDATE SET
      ${assignments.join(",\n      ")}
  `
  ).run(id, ...Object.values(productValues));

  revalidatePath("/estoque");
  revalidatePath(`/estoque/${id}/editar`);
  redirect("/estoque");
}
