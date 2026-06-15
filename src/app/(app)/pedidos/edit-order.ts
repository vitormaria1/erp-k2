import { randomUUID } from "node:crypto";

import { getDb } from "@/lib/db";
import { ensureFinancialSchema } from "@/lib/financial-ledger";
import {
  BONIFICACAO_PAYMENT_METHOD,
  buildReceivableInstallments,
  ensureOrderPaymentSchema,
  type OrderPaymentMethod,
} from "@/lib/payments";
import type { DraftItem } from "@/app/(app)/pedidos/novo/order-items-client";
import { parseCreateOrderFormData } from "@/app/(app)/pedidos/novo/create-order";

type EditableOrderHeader = {
  id: number;
  customerId: string;
  customerName: string;
  customerTradeName: string | null;
  customerCode: string | null;
  notes: string | null;
  paymentMethod: OrderPaymentMethod;
};

type EditableOrderReceivable = {
  id: string;
  status: string;
  dueDate: string;
  amount: number;
};

type EditableOrderItem = DraftItem & {
  description: string;
  reference: string;
  unit: string | null;
};

export type EditableOrderData = {
  order: EditableOrderHeader;
  items: EditableOrderItem[];
  receivables: EditableOrderReceivable[];
  installments: number;
  dueDate: string;
  editBlockReason: string | null;
};

function buildEditBlockReason(orderId: number) {
  const db = getDb();
  ensureFinancialSchema(db);

  try {
    const activeInvoice = db
      .prepare(
        `
        SELECT id
        FROM fiscal_invoices
        WHERE source_order_id = ?
          AND internal_status NOT IN ('CANCELED', 'DENIED')
        ORDER BY created_at DESC
        LIMIT 1
      `
      )
      .get(orderId) as { id: string } | undefined;
    if (activeInvoice) {
      return "Este orçamento já possui NF vinculada. Cancele/ajuste a NF antes de editar os itens.";
    }
  } catch {
    // fiscal layer not available in this environment
  }

  const boleto = db
    .prepare(
      `
      SELECT b.id
      FROM boletos b
      JOIN receivables r ON r.id = b.receivable_id
      WHERE r.order_id = ?
      LIMIT 1
    `
    )
    .get(orderId) as { id: string } | undefined;
  if (boleto) {
    return "Este orçamento já possui boleto gerado. Remova o boleto no fluxo financeiro antes de editar.";
  }

  const settledReceivable = db
    .prepare(
      `
      SELECT id, status
      FROM receivables
      WHERE order_id = ?
        AND status <> 'OPEN'
      LIMIT 1
    `
    )
    .get(orderId) as { id: string; status: string } | undefined;
  if (settledReceivable) {
    return "Este orçamento possui recebível já processado. A edição foi bloqueada para evitar inconsistência financeira.";
  }

  return null;
}

export function loadEditableOrder(orderId: number): EditableOrderData | null {
  const db = getDb();
  ensureOrderPaymentSchema(db);
  ensureFinancialSchema(db);

  const order = db
    .prepare(
      `
      SELECT
        o.id as id,
        o.customer_id as "customerId",
        c.name as "customerName",
        c.trade_name as "customerTradeName",
        c.code as "customerCode",
        o.notes as notes,
        o.payment_method as "paymentMethod"
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE o.id = ?
    `
    )
    .get(orderId) as EditableOrderHeader | undefined;
  if (!order) return null;

  const items = db
    .prepare(
      `
      SELECT
        oi.product_id as "productId",
        oi.quantity as quantity,
        oi.unit_price as "unitPrice",
        p.description as description,
        p.reference as reference,
        p.unit as unit
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
      ORDER BY p.description
    `
    )
    .all(orderId) as EditableOrderItem[];

  const receivables = db
    .prepare(
      `
      SELECT id, status, due_date as "dueDate", amount
      FROM receivables
      WHERE order_id = ?
      ORDER BY due_date ASC, created_at ASC
    `
    )
    .all(orderId) as EditableOrderReceivable[];

  const installments = Math.max(1, receivables.length || 1);
  const dueDate = String(receivables[0]?.dueDate ?? "").slice(0, 10);

  return {
    order,
    items,
    receivables,
    installments,
    dueDate,
    editBlockReason: buildEditBlockReason(orderId),
  };
}

export function updateOrder(orderId: number, formData: FormData) {
  const input = parseCreateOrderFormData(formData);
  const db = getDb();
  ensureOrderPaymentSchema(db);
  ensureFinancialSchema(db);

  const editBlockReason = buildEditBlockReason(orderId);
  if (editBlockReason) {
    throw new Error(editBlockReason);
  }

  const existingOrder = db
    .prepare("SELECT id FROM orders WHERE id = ?")
    .get(orderId) as { id: number } | undefined;
  if (!existingOrder) {
    throw new Error("Orçamento não encontrado.");
  }

  const previousItems = db
    .prepare(
      `
      SELECT product_id as "productId", quantity, unit_price as "unitPrice"
      FROM order_items
      WHERE order_id = ?
    `
    )
    .all(orderId) as Array<{ productId: string; quantity: number; unitPrice: number | null }>;

  const run = db.transaction(() => {
    db.prepare(
      "UPDATE orders SET customer_id = ?, notes = ?, payment_method = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(input.customerId, input.notes ?? null, input.paymentMethod, orderId);

    const updateStock = db.prepare(
      "UPDATE products SET stock_qty = stock_qty + ?, updated_at = datetime('now') WHERE id = ?"
    );
    const updateStockOut = db.prepare(
      "UPDATE products SET stock_qty = stock_qty - ?, updated_at = datetime('now') WHERE id = ?"
    );
    const getStock = db.prepare("SELECT stock_qty as stockQty FROM products WHERE id = ?");
    const insertMove = db.prepare(
      `
      INSERT INTO stock_movements
        (id, product_id, type, quantity, unit_cost, reason_code, note, reason, order_id, production_order_id, purchase_invoice_id, meta_json, created_at)
      VALUES
        (?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, NULL, ?, datetime('now'))
    `
    );

    for (const previousItem of previousItems) {
      updateStock.run(previousItem.quantity, previousItem.productId);
      insertMove.run(
        randomUUID(),
        previousItem.productId,
        "IN",
        previousItem.quantity,
        "SALE_EDIT_REVERT",
        "Reversão de estoque para edição do orçamento",
        "SALE_EDIT_REVERT",
        orderId,
        JSON.stringify({ previousUnitPrice: previousItem.unitPrice ?? null })
      );
    }

    db.prepare("DELETE FROM order_items WHERE order_id = ?").run(orderId);
    db.prepare("DELETE FROM receivables WHERE order_id = ?").run(orderId);

    const insertItem = db.prepare(
      "INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?)"
    );

    for (const item of input.items) {
      const current = getStock.get(item.productId) as { stockQty: number } | undefined;
      const beforeQty = Number(current?.stockQty ?? 0);
      const afterQty = beforeQty - item.quantity;
      const note =
        afterQty < 0 ? `ESTOQUE INSUFICIENTE (antes ${beforeQty.toFixed(3)}, depois ${afterQty.toFixed(3)})` : null;

      insertItem.run(randomUUID(), orderId, item.productId, item.quantity, typeof item.unitPrice === "number" ? item.unitPrice : null);
      updateStockOut.run(item.quantity, item.productId);
      insertMove.run(
        randomUUID(),
        item.productId,
        "OUT",
        item.quantity,
        "SALE_EDIT",
        note,
        "SALE_EDIT",
        orderId,
        JSON.stringify({ unitPrice: item.unitPrice ?? null, stockBefore: beforeQty, stockAfter: afterQty })
      );
    }

    const totalAmount = input.items.reduce((acc, item) => acc + (item.unitPrice ?? 0) * item.quantity, 0);
    if (totalAmount > 0 && input.paymentMethod !== BONIFICACAO_PAYMENT_METHOD) {
      const installments = buildReceivableInstallments({
        method: input.paymentMethod,
        totalAmount,
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
  });

  run();
}
