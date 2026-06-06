"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { isAuthenticated } from "@/lib/simple-auth";

import { ORDER_STATUS_VALUES, type OrderStatus } from "./status";

const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUS_VALUES),
});

export async function updateOrderStatusAction(orderId: number, formData: FormData) {
  if (!(await isAuthenticated())) {
    throw new Error("Unauthorized");
  }

  const { status } = updateOrderStatusSchema.parse({
    status: formData.get("status"),
  });

  updateOrderStatus(orderId, status);
  revalidatePath("/pedidos");
}

function updateOrderStatus(orderId: number, status: OrderStatus) {
  const db = getDb();
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, orderId);
}
