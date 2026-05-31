"use server";

import { z } from "zod";

import { applyStockMovement } from "@/lib/inventory";

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
