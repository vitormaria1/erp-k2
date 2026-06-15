"use server";

import { redirect } from "next/navigation";

import { isAuthenticated } from "@/lib/simple-auth";

import { updateOrder } from "../../edit-order";

export async function updateOrderAction(orderId: number, formData: FormData) {
  if (!(await isAuthenticated())) {
    throw new Error("Unauthorized");
  }

  updateOrder(orderId, formData);
  redirect("/pedidos");
}
