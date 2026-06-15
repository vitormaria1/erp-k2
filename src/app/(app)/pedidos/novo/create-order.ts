import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getDb } from "@/lib/db";
import {
  BONIFICACAO_PAYMENT_METHOD,
  buildReceivableInstallments,
  ensureOrderPaymentSchema,
  ORDER_PAYMENT_METHOD_VALUES,
} from "@/lib/payments";
import {
  FISCAL_OPERATION_CODE_BONIFICACAO_5910,
  isPedidoFiscalOperationCode,
  type PedidoFiscalOperationCode,
} from "@/fiscal/config/operation_options";

export const itemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().finite().positive(),
  unitPrice: z.number().finite().nonnegative().optional(),
});

export const createSchema = z.object({
  customerId: z.string().min(1),
  notes: z.string().optional(),
  itemsJson: z.string().min(2),
  paymentMethod: z.enum(ORDER_PAYMENT_METHOD_VALUES),
  dueDate: z.string().optional(),
  installments: z.coerce.number().int().min(1).max(12).default(1),
  fiscalOperationCode: z.string().optional(),
});

function normalizeOrderInput(args: {
  paymentMethod: (typeof ORDER_PAYMENT_METHOD_VALUES)[number];
  dueDate?: string;
  installments: number;
  fiscalOperationCode?: string;
}) {
  const fiscalOperationCode = isPedidoFiscalOperationCode(args.fiscalOperationCode)
    ? (args.fiscalOperationCode as PedidoFiscalOperationCode)
    : undefined;
  if (fiscalOperationCode === FISCAL_OPERATION_CODE_BONIFICACAO_5910) {
    return {
      paymentMethod: BONIFICACAO_PAYMENT_METHOD,
      dueDate: undefined,
      installments: 1,
      fiscalOperationCode,
    };
  }

  return {
    paymentMethod: args.paymentMethod,
    dueDate: args.dueDate,
    installments: args.installments,
    fiscalOperationCode,
  };
}

export function parseCreateOrderFormData(formData: FormData) {
  const parsed = createSchema.parse({
    customerId: formData.get("customerId"),
    notes: formData.get("notes")?.toString(),
    itemsJson: formData.get("itemsJson")?.toString(),
    paymentMethod: formData.get("paymentMethod"),
    dueDate: formData.get("dueDate")?.toString(),
    installments: formData.get("installments"),
    fiscalOperationCode: formData.get("fiscalOperationCode")?.toString(),
  });

  const items = z.array(itemSchema).parse(JSON.parse(parsed.itemsJson));
  if (items.length === 0) throw new Error("Inclua ao menos 1 item.");

  const normalized = normalizeOrderInput(parsed);
  return { ...parsed, ...normalized, items };
}

export function createOrder(input: ReturnType<typeof parseCreateOrderFormData>) {
  const db = getDb();
  ensureOrderPaymentSchema(db);
  const run = db.transaction(() => {
    const result = db
      .prepare("INSERT INTO orders (customer_id, status, notes, payment_method) VALUES (?, 'FEITO', ?, ?)")
      .run(input.customerId, input.notes ?? null, input.paymentMethod);

    const orderId = Number(result.lastInsertRowid);

    const insertItem = db.prepare(
      "INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?)"
    );
    const updateStock = db.prepare(
      "UPDATE products SET stock_qty = stock_qty - ?, updated_at = datetime('now') WHERE id = ?"
    );
    const getStock = db.prepare("SELECT stock_qty as stockQty FROM products WHERE id = ?");
    const insertMove = db.prepare(
      `
      INSERT INTO stock_movements
        (id, product_id, type, quantity, unit_cost, reason_code, note, reason, order_id, production_order_id, purchase_invoice_id, meta_json, created_at)
      VALUES
        (?, ?, 'OUT', ?, NULL, ?, ?, ?, ?, NULL, NULL, ?, datetime('now'))
    `
    );

    for (const it of input.items) {
      const curr = getStock.get(it.productId) as { stockQty: number } | undefined;
      const beforeQty = Number(curr?.stockQty ?? 0);
      const afterQty = beforeQty - it.quantity;
      const note =
        afterQty < 0 ? `ESTOQUE INSUFICIENTE (antes ${beforeQty.toFixed(3)}, depois ${afterQty.toFixed(3)})` : null;

      insertItem.run(
        randomUUID(),
        orderId,
        it.productId,
        it.quantity,
        typeof it.unitPrice === "number" ? it.unitPrice : null
      );

      updateStock.run(it.quantity, it.productId);
      insertMove.run(
        randomUUID(),
        it.productId,
        it.quantity,
        "SALE",
        note,
        "SALE",
        orderId,
        JSON.stringify({ unitPrice: it.unitPrice ?? null, stockBefore: beforeQty, stockAfter: afterQty })
      );
    }

    const amount = input.items.reduce((acc, it) => acc + (it.unitPrice ?? 0) * it.quantity, 0);
    if (amount > 0) {
      const installments = buildReceivableInstallments({
        method: input.paymentMethod,
        totalAmount: amount,
        dueDate: input.dueDate,
        installments: input.installments,
      });
      const insertReceivable = db.prepare(
        "INSERT INTO receivables (id, customer_id, order_id, status, method, amount, due_date) VALUES (?, ?, ?, 'OPEN', ?, ?, ?)"
      );
      for (const installment of installments) {
        insertReceivable.run(
          randomUUID(),
          input.customerId,
          orderId,
          input.paymentMethod,
          installment.amount,
          installment.dueDateIso
        );
      }
    }

    return orderId;
  });

  return run();
}
