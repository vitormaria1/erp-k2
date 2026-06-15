import { getDb } from "./db";
import { ensureOrderPaymentSchema } from "./payments";

export function getOrderPostIssueRedirect(orderId: number) {
  const db = getDb();
  ensureOrderPaymentSchema(db);

  const order = db
    .prepare("SELECT payment_method as \"paymentMethod\" FROM orders WHERE id = ?")
    .get(orderId) as { paymentMethod: string | null } | undefined;
  if (!order || order.paymentMethod !== "BOLETO") return null;

  const receivable = db
    .prepare(
      `
      SELECT id
      FROM receivables
      WHERE order_id = ?
      ORDER BY due_date ASC, created_at ASC
      LIMIT 1
    `
    )
    .get(orderId) as { id: string } | undefined;
  if (!receivable) return null;

  return `/financeiro?setor=receber&receivableId=${encodeURIComponent(receivable.id)}#receivable-${encodeURIComponent(receivable.id)}`;
}
