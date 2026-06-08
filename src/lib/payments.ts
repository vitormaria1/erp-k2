import { getSaoPauloDateIso } from "./datetime";
import { getDb } from "./db";

type DbLike = ReturnType<typeof getDb>;

let orderPaymentSchemaReady = false;

export const ORDER_PAYMENT_METHOD_VALUES = ["PIX", "CASH", "BOLETO"] as const;
export type OrderPaymentMethod = (typeof ORDER_PAYMENT_METHOD_VALUES)[number];
export const BOLETO_DUE_SHORTCUT_DAYS = [7, 14, 21] as const;

export function ensureOrderPaymentSchema(db: DbLike) {
  if (orderPaymentSchemaReady) return;

  db.exec("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT");
  db.exec("ALTER TABLE orders ALTER COLUMN payment_method SET DEFAULT 'BOLETO'");
  db.exec("UPDATE orders SET payment_method = 'BOLETO' WHERE payment_method IS NULL OR BTRIM(payment_method) = ''");

  orderPaymentSchemaReady = true;
}

export function getOrderPaymentMethodLabel(method: string | null | undefined) {
  switch (method) {
    case "PIX":
      return "Pix";
    case "CASH":
      return "Dinheiro";
    case "BOLETO":
      return "Boleto";
    default:
      return method?.trim() || "Nao informado";
  }
}

export function isOrderPaymentMethod(value: string): value is OrderPaymentMethod {
  return ORDER_PAYMENT_METHOD_VALUES.includes(value as OrderPaymentMethod);
}

export function getDefaultReceivableDueDate(method: OrderPaymentMethod, dueDate?: string | null) {
  if (method === "BOLETO") {
    if (dueDate?.trim()) return normalizePaymentDate(dueDate);

    return getRelativeDueDateIso(7);
  }

  return normalizePaymentDate(getSaoPauloDateIso());
}

export function getRelativeDueDateIso(days: number) {
  const base = new Date(`${getSaoPauloDateIso()}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString();
}

export function getRelativeDueDateInputValue(days: number) {
  return getRelativeDueDateIso(days).slice(0, 10);
}

export function getPaymentIndicator(method: OrderPaymentMethod) {
  return method === "BOLETO" ? 1 : 0;
}

export function getFocusPaymentCode(method: OrderPaymentMethod) {
  switch (method) {
    case "CASH":
      return "01";
    case "BOLETO":
      return "15";
    case "PIX":
      return "17";
  }
}

export function buildReceivableInstallments(args: {
  method: OrderPaymentMethod;
  totalAmount: number;
  dueDate?: string | null;
  installments?: number | null;
}) {
  const totalAmount = Number(args.totalAmount ?? 0);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return [];

  if (args.method !== "BOLETO") {
    return [
      {
        amount: round2(totalAmount),
        dueDateIso: getDefaultReceivableDueDate(args.method, args.dueDate),
      },
    ];
  }

  const installments = Math.max(1, Math.trunc(args.installments ?? 1));
  const firstDueDate = args.dueDate?.trim() ? args.dueDate : getRelativeDueDateInputValue(7);
  const baseCents = Math.round(totalAmount * 100);
  const installmentCents = Math.floor(baseCents / installments);
  const remainder = baseCents - installmentCents * installments;

  return Array.from({ length: installments }, (_value, index) => ({
    amount: (installmentCents + (index === installments - 1 ? remainder : 0)) / 100,
    dueDateIso: normalizePaymentDate(addDaysToInputDate(firstDueDate, index * 7)),
  }));
}

function normalizePaymentDate(value: string) {
  return new Date(`${value}T12:00:00Z`).toISOString();
}

function addDaysToInputDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
