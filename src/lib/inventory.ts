import "server-only";

import { randomUUID } from "node:crypto";

import { getDb } from "@/lib/db";

export type StockMovementType = "IN" | "OUT" | "ADJUSTMENT";

export type StockMovementReason =
  | "MANUAL"
  | "PURCHASE"
  | "SALE"
  | "PRODUCTION_CONSUME"
  | "PRODUCTION_FINISH"
  | "REVERSAL";

export type ApplyStockMovementInput = {
  productId: string;
  type: StockMovementType;
  quantity: number;
  reasonCode: StockMovementReason;
  note?: string | null;
  unitCost?: number | null;
  orderId?: number | null;
  productionOrderId?: string | null;
  purchaseInvoiceId?: string | null;
  meta?: unknown;
};

export function applyStockMovement(input: ApplyStockMovementInput) {
  const db = getDb();

  const metaJson =
    typeof input.meta === "undefined" ? null : JSON.stringify(input.meta, (_k, v) => v);

  const run = db.transaction(() => {
    const current = db
      .prepare("SELECT stock_qty as stockQty FROM products WHERE id = ?")
      .get(input.productId) as { stockQty: number } | undefined;
    if (!current) throw new Error("Produto não encontrado.");

    const delta = input.type === "OUT" ? -input.quantity : input.quantity;
    const nextQty = input.type === "ADJUSTMENT" ? input.quantity : current.stockQty + delta;

    db.prepare("UPDATE products SET stock_qty = ?, updated_at = datetime('now') WHERE id = ?").run(
      nextQty,
      input.productId
    );

    db.prepare(
      `
      INSERT INTO stock_movements
        (id, product_id, type, quantity, unit_cost, reason_code, note, reason, order_id, production_order_id, purchase_invoice_id, meta_json, created_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `
    ).run(
      randomUUID(),
      input.productId,
      input.type,
      input.quantity,
      typeof input.unitCost === "number" ? input.unitCost : null,
      input.reasonCode,
      input.note ?? null,
      input.reasonCode + (input.note ? `:${input.note}` : ""),
      typeof input.orderId === "number" ? input.orderId : null,
      input.productionOrderId ?? null,
      input.purchaseInvoiceId ?? null,
      metaJson
    );
  });

  run();
}

export function setProductCost(productId: string, cost: number) {
  const db = getDb();
  db.prepare("UPDATE products SET cost = ?, updated_at = datetime('now') WHERE id = ?").run(
    cost,
    productId
  );
}

export function recalcProductCost(productId: string) {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT r.quantity as perUnit, p.cost as inputCost
      FROM product_recipes r
      JOIN products p ON p.id = r.input_product_id
      WHERE r.product_id = ?
    `
    )
    .all(productId) as { perUnit: number; inputCost: number | null }[];

  if (rows.length === 0) return;

  const total = rows.reduce((acc, r) => acc + Number(r.perUnit) * Number(r.inputCost ?? 0), 0);
  db.prepare("UPDATE products SET cost = ?, updated_at = datetime('now') WHERE id = ?").run(
    total,
    productId
  );
}

function listParents(db: ReturnType<typeof getDb>, childId: string) {
  return db
    .prepare("SELECT DISTINCT product_id as productId FROM product_recipes WHERE input_product_id = ?")
    .all(childId) as { productId: string }[];
}

function listChildren(db: ReturnType<typeof getDb>, parentId: string) {
  return db
    .prepare("SELECT input_product_id as inputProductId FROM product_recipes WHERE product_id = ?")
    .all(parentId) as { inputProductId: string }[];
}

function computeCost(db: ReturnType<typeof getDb>, productId: string): number | null {
  const rows = db
    .prepare(
      `
      SELECT r.quantity as perUnit, p.cost as inputCost
      FROM product_recipes r
      JOIN products p ON p.id = r.input_product_id
      WHERE r.product_id = ?
    `
    )
    .all(productId) as { perUnit: number; inputCost: number | null }[];

  if (rows.length === 0) return null;
  return rows.reduce((acc, r) => acc + Number(r.perUnit) * Number(r.inputCost ?? 0), 0);
}

export function propagateCostFromInput(inputProductId: string) {
  const db = getDb();

  // Coletar todos os "pais" afetados
  const visited = new Set<string>();
  const queue: string[] = [inputProductId];

  while (queue.length) {
    const curr = queue.shift()!;
    const parents = listParents(db, curr);
    for (const p of parents) {
      if (visited.has(p.productId)) continue;
      visited.add(p.productId);
      queue.push(p.productId);
    }
  }

  if (visited.size === 0) return;

  // Tentar ordem topológica (se houver ciclo, cai para convergência)
  const indeg = new Map<string, number>();
  for (const pid of visited) indeg.set(pid, 0);

  for (const pid of visited) {
    const children = listChildren(db, pid);
    for (const c of children) {
      if (!visited.has(c.inputProductId)) continue;
      indeg.set(c.inputProductId, (indeg.get(c.inputProductId) ?? 0) + 1);
    }
  }

  const topo: string[] = [];
  const q: string[] = [];
  for (const [pid, d] of indeg) if (d === 0) q.push(pid);

  while (q.length) {
    const pid = q.shift()!;
    topo.push(pid);
    for (const c of listChildren(db, pid)) {
      if (!visited.has(c.inputProductId)) continue;
      const next = (indeg.get(c.inputProductId) ?? 0) - 1;
      indeg.set(c.inputProductId, next);
      if (next === 0) q.push(c.inputProductId);
    }
  }

  const hasCycle = topo.length !== visited.size;
  const list = hasCycle ? Array.from(visited) : topo;

  // Atualizar custos com convergência limitada (cobre cadeias e ciclos)
  for (let pass = 0; pass < 20; pass++) {
    let changed = false;
    for (const pid of list) {
      const nextCost = computeCost(db, pid);
      if (nextCost === null) continue;
      const prev = db
        .prepare("SELECT cost as cost FROM products WHERE id = ?")
        .get(pid) as { cost: number | null } | undefined;
      const prevCost = Number(prev?.cost ?? 0);
      if (Math.abs(prevCost - nextCost) > 1e-8) {
        db.prepare("UPDATE products SET cost = ?, updated_at = datetime('now') WHERE id = ?").run(
          nextCost,
          pid
        );
        changed = true;
      }
    }
    if (!changed) break;
  }
}
