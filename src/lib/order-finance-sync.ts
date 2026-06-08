import { getDb } from "./db";
import { ensureFinancialSchema, updateReceivableLedgerStatus } from "./financial-ledger";

export type ReceivableStatus = "OPEN" | "PAID" | "OVERDUE" | "CANCELED";
export type SyncedOrderStatus = "FEITO" | "SEPARADO" | "ENVIADO" | "ENTREGUE";

type DbLike = ReturnType<typeof getDb>;

function listReceivablesByOrderId(db: DbLike, orderId: number) {
  return db
    .prepare(
      `
      SELECT id, status
      FROM receivables
      WHERE order_id = ?
      ORDER BY created_at DESC
    `
    )
    .all(orderId) as Array<{ id: string; status: ReceivableStatus }>;
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

  const receivables = listReceivablesByOrderId(db, orderId);
  if (receivables.length === 0) return;

  ensureFinancialSchema(db);
  for (const receivable of receivables) {
    updateReceivableLedgerStatus({
      db,
      receivableId: receivable.id,
      status: mode === "PAID" ? "PAID" : "OPEN",
      effectiveDate,
    });
  }
}
