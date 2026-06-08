import { getSaoPauloDateIso } from "./datetime";
import { getDb } from "./db";

type DbLike = ReturnType<typeof getDb>;

let orderPaymentSchemaReady = false;

export const ORDER_PAYMENT_METHOD_VALUES = ["PIX", "CASH", "BOLETO"] as const;
export type OrderPaymentMethod = (typeof ORDER_PAYMENT_METHOD_VALUES)[number];

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

    const base = new Date(`${getSaoPauloDateIso()}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() + 7);
    return base.toISOString();
  }

  return normalizePaymentDate(getSaoPauloDateIso());
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

function normalizePaymentDate(value: string) {
  return new Date(`${value}T12:00:00Z`).toISOString();
}
