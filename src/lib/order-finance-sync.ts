import { getDb } from "./db";

export type ReceivableStatus = "OPEN" | "PAID" | "OVERDUE" | "CANCELED";
export type SyncedOrderStatus = "FEITO" | "SEPARADO" | "ENVIADO" | "ENTREGUE" | "PAGO";

type DbLike = ReturnType<typeof getDb>;

function getLatestReceivableByOrderId(db: DbLike, orderId: number) {
  return db
    .prepare(
      `
      SELECT id, status
      FROM receivables
      WHERE order_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `
    )
    .get(orderId) as { id: string; status: ReceivableStatus } | undefined;
}

function getReceivableWithOrder(db: DbLike, receivableId: string) {
  return db
    .prepare("SELECT id, order_id as orderId, status FROM receivables WHERE id = ?")
    .get(receivableId) as { id: string; orderId: number | null; status: ReceivableStatus } | undefined;
}

function getOrderStatus(db: DbLike, orderId: number) {
  return db
    .prepare("SELECT status FROM orders WHERE id = ?")
    .get(orderId) as { status: SyncedOrderStatus | string } | undefined;
}

function setOrderStatusOnly(db: DbLike, orderId: number, status: string) {
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, orderId);
}

function setReceivableStatusOnly(db: DbLike, receivableId: string, status: ReceivableStatus) {
  db.prepare(
    `
    UPDATE receivables
    SET
      status = ?,
      paid_at = CASE
        WHEN ? = 'PAID' THEN COALESCE(paid_at, datetime('now'))
        ELSE NULL
      END,
      updated_at = datetime('now')
    WHERE id = ?
  `
  ).run(status, status, receivableId);
}

export function updateOrderStatusWithFinancialSync(db: DbLike, orderId: number, status: SyncedOrderStatus) {
  setOrderStatusOnly(db, orderId, status);

  const receivable = getLatestReceivableByOrderId(db, orderId);
  if (!receivable) return;

  if (status === "PAGO") {
    setReceivableStatusOnly(db, receivable.id, "PAID");
    return;
  }

  if (receivable.status === "PAID") {
    setReceivableStatusOnly(db, receivable.id, "OPEN");
  }
}

export function updateReceivableStatusWithOrderSync(db: DbLike, receivableId: string, status: ReceivableStatus) {
  const receivable = getReceivableWithOrder(db, receivableId);
  if (!receivable) {
    throw new Error("Recebivel nao encontrado.");
  }

  setReceivableStatusOnly(db, receivableId, status);

  if (typeof receivable.orderId !== "number") return;

  const order = getOrderStatus(db, receivable.orderId);
  if (!order) return;

  if (status !== "PAID" && order.status === "PAGO") {
    setOrderStatusOnly(db, receivable.orderId, "ENTREGUE");
  }
}

export function startRouteClosure(db: DbLike, loadingId: string) {
  db.prepare(
    `
    UPDATE orders
    SET status = 'ENTREGUE', updated_at = datetime('now')
    WHERE id IN (SELECT order_id FROM loading_orders WHERE loading_id = ?)
  `
  ).run(loadingId);
}

export function closeRouteOrder(db: DbLike, orderId: number, mode: "PAID" | "OPEN") {
  setOrderStatusOnly(db, orderId, "ENTREGUE");

  const receivable = getLatestReceivableByOrderId(db, orderId);
  if (!receivable) return;

  setReceivableStatusOnly(db, receivable.id, mode === "PAID" ? "PAID" : "OPEN");
}
