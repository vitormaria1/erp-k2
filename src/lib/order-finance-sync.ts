import { getDb } from "./db";
import { ensureFinancialSchema, updateReceivableLedgerStatus } from "./financial-ledger";

export type ReceivableStatus = "OPEN" | "PAID" | "OVERDUE" | "CANCELED";
export type SyncedOrderStatus = "FEITO" | "SEPARADO" | "ENVIADO" | "ENTREGUE";

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

function setOrderStatusOnly(db: DbLike, orderId: number, status: string) {
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, orderId);
}

export function updateOrderStatusWithFinancialSync(db: DbLike, orderId: number, status: SyncedOrderStatus) {
  setOrderStatusOnly(db, orderId, status);
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

export function closeRouteOrder(
  db: DbLike,
  orderId: number,
  mode: "PAID" | "OPEN",
  effectiveDate?: string | null
) {
  setOrderStatusOnly(db, orderId, "ENTREGUE");

  const receivable = getLatestReceivableByOrderId(db, orderId);
  if (!receivable) return;

  ensureFinancialSchema(db);
  updateReceivableLedgerStatus({
    db,
    receivableId: receivable.id,
    status: mode === "PAID" ? "PAID" : "OPEN",
    effectiveDate,
  });
}
