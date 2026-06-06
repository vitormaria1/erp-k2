"use server";

import { redirect } from "next/navigation";

import { createOrder, parseCreateOrderFormData } from "./create-order";

export async function createOrderAction(formData: FormData) {
  const orderId = createOrder(parseCreateOrderFormData(formData));
  redirect(`/pedidos/${orderId}/imprimir`);
}
