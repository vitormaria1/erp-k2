"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb } from "@/lib/db";
import {
  ensureFinancialSchema,
  updateReceivablePaymentMethod,
  updatePayableLedgerStatus,
  updateReceivableLedgerStatus,
} from "@/lib/financial-ledger";
import { ORDER_PAYMENT_METHOD_VALUES } from "@/lib/payments";
import {
  closeRouteOrder,
  startRouteClosure,
  updateOrderStatusWithFinancialSync,
} from "@/lib/order-finance-sync";
import {
  SIMPLE_FINANCE_PIN,
  createFinanceSession,
  clearFinanceSession,
  isAuthenticated,
  isFinanceAuthenticated,
} from "@/lib/simple-auth";

import { ORDER_STATUS_VALUES } from "../pedidos/status";

export type FinanceUnlockState = {
  error: string | null;
  unlocked: boolean;
};

const receivableSchema = z.object({ receivableId: z.string().min(1) });
const receivableStatusSchema = z.object({
  status: z.enum(["OPEN", "PAID", "OVERDUE", "CANCELED"]),
  effectiveDate: z.string().optional(),
  method: z.enum(ORDER_PAYMENT_METHOD_VALUES),
  dueDate: z.string().optional(),
});

const payablePaymentSchema = z.object({
  payableId: z.string().min(1),
  effectiveDate: z.string().optional(),
});

const receivableSettlementSchema = z.object({
  receivableId: z.string().min(1),
  effectiveDate: z.string().optional(),
  method: z.enum(ORDER_PAYMENT_METHOD_VALUES),
  dueDate: z.string().optional(),
});

const payableStatusSchema = z.object({
  status: z.enum(["PENDING", "PAID", "CANCELED"]),
  effectiveDate: z.string().optional(),
});

const orderStatusSchema = z.object({
  status: z.enum(ORDER_STATUS_VALUES),
});

const routeCloseSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  mode: z.enum(["PAID", "OPEN"]),
  effectiveDate: z.string().optional(),
});

const routeStartSchema = z.object({
  loadingId: z.string().min(1),
});

const financePinSchema = z.object({
  pin: z.string().trim().regex(/^\d{4}$/),
});

function fakeLinhaDigitavel() {
  return Array.from({ length: 47 }, () => Math.floor(Math.random() * 10)).join("");
}

function revalidateFinanceViews() {
  revalidatePath("/financeiro");
  revalidatePath("/pedidos");
  revalidatePath("/compras");
}

async function ensureFinanceAuthorized() {
  if (!(await isAuthenticated())) {
    throw new Error("Unauthorized");
  }
  if (!(await isFinanceAuthenticated())) {
    throw new Error("FinanceUnauthorized");
  }
}

export async function financeUnlockAction(
  _prevState: FinanceUnlockState,
  formData: FormData
): Promise<FinanceUnlockState> {
  if (!(await isAuthenticated())) {
    return { error: "Sessao expirada. Entre novamente.", unlocked: false };
  }

  const { pin } = financePinSchema.parse({
    pin: formData.get("pin"),
  });

  if (pin !== SIMPLE_FINANCE_PIN) {
    return { error: "PIN invalido.", unlocked: false };
  }

  await createFinanceSession();
  revalidatePath("/financeiro");
  return { error: null, unlocked: true };
}

export async function financeLockAction() {
  await clearFinanceSession();
  revalidatePath("/financeiro");
}

export async function gerarBoletoMockAction(formData: FormData) {
  await ensureFinanceAuthorized();

  const { receivableId } = receivableSchema.parse({ receivableId: formData.get("receivableId") });
  const db = getDb();

  const run = db.transaction(() => {
    const r = db
      .prepare(
        `
        SELECT r.id, r.amount, r.due_date as dueDate, r.method, c.name as customerName
        FROM receivables r
        JOIN customers c ON c.id = r.customer_id
        WHERE r.id = ?
      `
      )
      .get(receivableId) as
      | { id: string; amount: number; dueDate: string; method: string; customerName: string }
      | undefined;
    if (!r) throw new Error("Recebivel nao encontrado.");
    if (r.method !== "BOLETO") throw new Error("Recebivel nao e BOLETO.");

    const exists = db.prepare("SELECT 1 FROM boletos WHERE receivable_id = ?").get(receivableId);
    if (exists) return;

    const payload = {
      id: randomUUID(),
      receivableId,
      customerName: r.customerName,
      amount: r.amount,
      dueDate: r.dueDate,
      linhaDigitavel: fakeLinhaDigitavel(),
      createdAt: new Date().toISOString(),
      provider: "mock",
    };

    db.prepare("INSERT INTO boletos (id, receivable_id, payload_json) VALUES (?, ?, ?)").run(
      payload.id,
      receivableId,
      JSON.stringify(payload)
    );
  });

  run();
  revalidateFinanceViews();
}

export async function updateReceivableStatusAction(receivableId: string, formData: FormData) {
  await ensureFinanceAuthorized();

  const { status, effectiveDate, method, dueDate } = receivableStatusSchema.parse({
    status: formData.get("status"),
    effectiveDate: formData.get("effectiveDate")?.toString(),
    method: formData.get("method"),
    dueDate: formData.get("dueDate")?.toString(),
  });

  const db = getDb();
  ensureFinancialSchema(db);
  updateReceivablePaymentMethod({ db, receivableId, method, dueDate });
  updateReceivableLedgerStatus({
    db,
    receivableId,
    status,
    effectiveDate,
  });

  revalidateFinanceViews();
}

export async function settleReceivableAction(formData: FormData) {
  await ensureFinanceAuthorized();

  const { receivableId, effectiveDate, method, dueDate } = receivableSettlementSchema.parse({
    receivableId: formData.get("receivableId"),
    effectiveDate: formData.get("effectiveDate")?.toString(),
    method: formData.get("method"),
    dueDate: formData.get("dueDate")?.toString(),
  });
  const db = getDb();
  ensureFinancialSchema(db);
  updateReceivablePaymentMethod({ db, receivableId, method, dueDate });
  updateReceivableLedgerStatus({ db, receivableId, status: "PAID", effectiveDate });
  revalidateFinanceViews();
}

export async function updatePayableStatusAction(payableId: string, formData: FormData) {
  await ensureFinanceAuthorized();

  const { status, effectiveDate } = payableStatusSchema.parse({
    status: formData.get("status"),
    effectiveDate: formData.get("effectiveDate")?.toString(),
  });

  const db = getDb();
  ensureFinancialSchema(db);
  updatePayableLedgerStatus({
    db,
    payableId,
    status,
    effectiveDate,
  });

  revalidateFinanceViews();
}

export async function settlePayableAction(formData: FormData) {
  await ensureFinanceAuthorized();

  const { payableId, effectiveDate } = payablePaymentSchema.parse({
    payableId: formData.get("payableId"),
    effectiveDate: formData.get("effectiveDate")?.toString(),
  });
  const db = getDb();
  ensureFinancialSchema(db);
  updatePayableLedgerStatus({ db, payableId, status: "PAID", effectiveDate });
  revalidateFinanceViews();
}

export async function updateFinanceOrderStatusAction(orderId: number, formData: FormData) {
  await ensureFinanceAuthorized();

  const { status } = orderStatusSchema.parse({
    status: formData.get("status"),
  });

  const db = getDb();
  updateOrderStatusWithFinancialSync(db, orderId, status);
  revalidateFinanceViews();
}

export async function closeRouteOrderAction(formData: FormData) {
  await ensureFinanceAuthorized();

  const { orderId, mode } = routeCloseSchema.parse({
    orderId: formData.get("orderId"),
    mode: formData.get("mode"),
    effectiveDate: formData.get("effectiveDate")?.toString(),
  });

  const db = getDb();
  closeRouteOrder(db, orderId, mode, formData.get("effectiveDate")?.toString());
  revalidateFinanceViews();
}

export async function startRouteClosureAction(formData: FormData) {
  await ensureFinanceAuthorized();

  const { loadingId } = routeStartSchema.parse({
    loadingId: formData.get("loadingId"),
  });

  const db = getDb();
  startRouteClosure(db, loadingId);
  revalidateFinanceViews();
}
