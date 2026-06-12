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

export type PedidoBoletoActionState = {
  ok: boolean;
  error: string | null;
};

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

export async function gerarPedidoBoletoStateAction(
  _prevState: PedidoBoletoActionState,
  formData: FormData
): Promise<PedidoBoletoActionState> {
  try {
    if (!(await isAuthenticated())) {
      return { ok: false, error: "Sessao expirada. Entre novamente." };
    }

    const receivableId = z.string().min(1).parse(formData.get("receivableId"));
    await generateBoletoForReceivable(receivableId);
    revalidatePath("/pedidos");
    revalidatePath("/financeiro");
    return { ok: true, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao gerar boleto.";
    return { ok: false, error: message };
  }
}

function updateOrderStatus(orderId: number, status: OrderStatus) {
  const db = getDb();
  updateOrderStatusWithFinancialSync(db, orderId, status);
}
