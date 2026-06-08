import { randomUUID } from "node:crypto";

import { getDb } from "./db";
import {
  ensureOrderPaymentSchema,
  ORDER_PAYMENT_METHOD_VALUES,
  type OrderPaymentMethod,
} from "./payments";

type DbLike = ReturnType<typeof getDb>;

export type ReceivableStatus = "OPEN" | "PAID" | "OVERDUE" | "CANCELED";
export type PayableStatus = "PENDING" | "PAID" | "CANCELED";

let schemaReady = false;

export function ensureFinancialSchema(db: DbLike) {
  if (schemaReady) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS payables (
      id UUID PRIMARY KEY,
      purchase_invoice_id UUID,
      supplier_name TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      method TEXT NOT NULL DEFAULT 'BOLETO',
      amount DOUBLE PRECISION NOT NULL,
      due_date TIMESTAMPTZ NOT NULL,
      paid_at TIMESTAMPTZ,
      payment_ref TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE SET NULL
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_payables_due_status ON payables(due_date, status)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_payables_invoice_id ON payables(purchase_invoice_id)");

  db.exec(`
    CREATE TABLE IF NOT EXISTS cash_movements (
      id UUID PRIMARY KEY,
      kind TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      method TEXT,
      amount DOUBLE PRECISION NOT NULL,
      effective_date TIMESTAMPTZ NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_movements_source_kind ON cash_movements(source_type, source_id, kind)");

  schemaReady = true;
}

export function normalizeEffectiveDate(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return new Date().toISOString();
  return new Date(`${raw}T12:00:00Z`).toISOString();
}

function setReceivableStatusOnly(
  db: DbLike,
  receivableId: string,
  status: ReceivableStatus,
  effectiveDateIso?: string
) {
  db.prepare(
    `
    UPDATE receivables
    SET
      status = ?,
      paid_at = CASE
        WHEN ? = 'PAID' THEN COALESCE(?, datetime('now'))
        ELSE NULL
      END,
      updated_at = datetime('now')
    WHERE id = ?
  `
  ).run(status, status, effectiveDateIso ?? null, receivableId);
}

function upsertCashMovement(args: {
  db: DbLike;
  kind: "IN" | "OUT";
  sourceType: "RECEIVABLE" | "PAYABLE";
  sourceId: string;
  method: string | null;
  amount: number;
  effectiveDate: string;
  note?: string | null;
}) {
  const existing = args.db
    .prepare("SELECT id FROM cash_movements WHERE source_type = ? AND source_id = ? AND kind = ?")
    .get(args.sourceType, args.sourceId, args.kind) as { id: string } | undefined;

  if (existing) {
    args.db
      .prepare(
        `
        UPDATE cash_movements
        SET method = ?, amount = ?, effective_date = ?, note = ?
        WHERE id = ?
      `
      )
      .run(args.method, args.amount, args.effectiveDate, args.note ?? null, existing.id);
    return;
  }

  args.db
    .prepare(
      `
      INSERT INTO cash_movements (id, kind, source_type, source_id, method, amount, effective_date, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      randomUUID(),
      args.kind,
      args.sourceType,
      args.sourceId,
      args.method,
      args.amount,
      args.effectiveDate,
      args.note ?? null
    );
}

function removeCashMovement(db: DbLike, sourceType: "RECEIVABLE" | "PAYABLE", sourceId: string, kind: "IN" | "OUT") {
  db.prepare("DELETE FROM cash_movements WHERE source_type = ? AND source_id = ? AND kind = ?").run(
    sourceType,
    sourceId,
    kind
  );
}

export function updateReceivableLedgerStatus(args: {
  db: DbLike;
  receivableId: string;
  status: ReceivableStatus;
  effectiveDate?: string | null;
}) {
  ensureFinancialSchema(args.db);

  const receivable = args.db
    .prepare("SELECT id, amount, method FROM receivables WHERE id = ?")
    .get(args.receivableId) as { id: string; amount: number; method: string | null } | undefined;
  if (!receivable) throw new Error("Recebivel nao encontrado.");

  const effectiveDateIso = normalizeEffectiveDate(args.effectiveDate);
  setReceivableStatusOnly(args.db, args.receivableId, args.status, effectiveDateIso);

  if (args.status === "PAID") {
    upsertCashMovement({
      db: args.db,
      kind: "IN",
      sourceType: "RECEIVABLE",
      sourceId: args.receivableId,
      method: receivable.method,
      amount: Number(receivable.amount ?? 0),
      effectiveDate: effectiveDateIso,
      note: "Recebimento de cliente",
    });
    return;
  }

  removeCashMovement(args.db, "RECEIVABLE", args.receivableId, "IN");
}

export function updateReceivablePaymentMethod(args: {
  db: DbLike;
  receivableId: string;
  method: OrderPaymentMethod;
  dueDate?: string | null;
}) {
  ensureFinancialSchema(args.db);
  ensureOrderPaymentSchema(args.db);

  if (!ORDER_PAYMENT_METHOD_VALUES.includes(args.method)) {
    throw new Error("Forma de recebimento invalida.");
  }

  const receivable = args.db
    .prepare("SELECT id, order_id as orderId, status, paid_at as paidAt, amount, due_date as dueDate FROM receivables WHERE id = ?")
    .get(args.receivableId) as
    | {
        id: string;
        orderId: number | null;
        status: ReceivableStatus;
        paidAt: string | null;
        amount: number;
        dueDate: string;
      }
    | undefined;
  if (!receivable) throw new Error("Recebivel nao encontrado.");

  const dueDateIso = args.dueDate?.trim() ? normalizeEffectiveDate(args.dueDate) : receivable.dueDate;
  args.db
    .prepare(
      `
      UPDATE receivables
      SET method = ?, due_date = ?, updated_at = datetime('now')
      WHERE id = ?
    `
    )
    .run(args.method, dueDateIso, args.receivableId);

  if (receivable.orderId != null) {
    args.db
      .prepare("UPDATE orders SET payment_method = ?, updated_at = datetime('now') WHERE id = ?")
      .run(args.method, receivable.orderId);
  }

  if (receivable.status === "PAID" && receivable.paidAt) {
    upsertCashMovement({
      db: args.db,
      kind: "IN",
      sourceType: "RECEIVABLE",
      sourceId: args.receivableId,
      method: args.method,
      amount: Number(receivable.amount ?? 0),
      effectiveDate: receivable.paidAt,
      note: "Recebimento de cliente",
    });
  }
}

function setPayableStatusOnly(
  db: DbLike,
  payableId: string,
  status: PayableStatus,
  effectiveDateIso?: string
) {
  db.prepare(
    `
    UPDATE payables
    SET
      status = ?,
      paid_at = CASE
        WHEN ? = 'PAID' THEN COALESCE(?, datetime('now'))
        ELSE NULL
      END,
      updated_at = datetime('now')
    WHERE id = ?
  `
  ).run(status, status, effectiveDateIso ?? null, payableId);
}

export function updatePayableLedgerStatus(args: {
  db: DbLike;
  payableId: string;
  status: PayableStatus;
  effectiveDate?: string | null;
}) {
  ensureFinancialSchema(args.db);

  const payable = args.db
    .prepare("SELECT id, amount, method, supplier_name as supplierName FROM payables WHERE id = ?")
    .get(args.payableId) as
    | { id: string; amount: number; method: string | null; supplierName: string | null }
    | undefined;
  if (!payable) throw new Error("Conta a pagar nao encontrada.");

  const effectiveDateIso = normalizeEffectiveDate(args.effectiveDate);
  setPayableStatusOnly(args.db, args.payableId, args.status, effectiveDateIso);

  if (args.status === "PAID") {
    upsertCashMovement({
      db: args.db,
      kind: "OUT",
      sourceType: "PAYABLE",
      sourceId: args.payableId,
      method: payable.method,
      amount: Number(payable.amount ?? 0),
      effectiveDate: effectiveDateIso,
      note: payable.supplierName
        ? `Pagamento a fornecedor: ${payable.supplierName}`
        : "Pagamento a fornecedor",
    });
    return;
  }

  removeCashMovement(args.db, "PAYABLE", args.payableId, "OUT");
}

export function createPayableForPurchaseInvoice(args: {
  db: DbLike;
  purchaseInvoiceId: string;
  supplierName: string | null;
  amount: number;
  method: string;
  dueDate: string;
  paymentRef?: string | null;
}) {
  ensureFinancialSchema(args.db);
  if (args.amount <= 0) return;

  args.db
    .prepare(
      `
      INSERT INTO payables (id, purchase_invoice_id, supplier_name, status, method, amount, due_date, payment_ref)
      VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?)
    `
    )
    .run(
      randomUUID(),
      args.purchaseInvoiceId,
      args.supplierName,
      args.method,
      args.amount,
      normalizeEffectiveDate(args.dueDate),
      args.paymentRef ?? null
    );
}
