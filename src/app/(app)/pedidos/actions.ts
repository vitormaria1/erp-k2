"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { generateBoletoForReceivable } from "@/lib/boleto-issuance";
import { getDb } from "@/lib/db";
import { updateOrderStatusWithFinancialSync } from "@/lib/order-finance-sync";
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

export async function gerarPedidoBoletoAction(formData: FormData) {
  if (!(await isAuthenticated())) {
    throw new Error("Unauthorized");
  }

  const receivableId = z.string().min(1).parse(formData.get("receivableId"));
  await generateBoletoForReceivable(receivableId);
  revalidatePath("/pedidos");
  revalidatePath("/financeiro");
}

function updateOrderStatus(orderId: number, status: OrderStatus) {
  const db = getDb();
  updateOrderStatusWithFinancialSync(db, orderId, status);
}
