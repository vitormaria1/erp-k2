import { getDb } from "@/lib/db";

function asFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const customerId = url.searchParams.get("customerId")?.trim() ?? "";
  const productId = url.searchParams.get("productId")?.trim() ?? "";

  if (!customerId || !productId) {
    return Response.json({ unitPrice: null }, { status: 200 });
  }

  const db = getDb();

  try {
    const row = db
      .prepare(
        `
        SELECT oi.unit_price as unitPrice
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN fiscal_invoices fi ON fi.source_order_id = o.id
        WHERE o.customer_id = ?
          AND oi.product_id = ?
          AND oi.unit_price IS NOT NULL
        ORDER BY COALESCE(fi.created_at, o.created_at) DESC, o.id DESC, oi.created_at DESC
        LIMIT 1
      `
      )
      .get(customerId, productId) as { unitPrice?: unknown } | undefined;

    return Response.json({ unitPrice: asFiniteNumber(row?.unitPrice ?? null) }, { status: 200 });
  } catch {
    const row = db
      .prepare(
        `
        SELECT oi.unit_price as unitPrice
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.customer_id = ?
          AND oi.product_id = ?
          AND oi.unit_price IS NOT NULL
        ORDER BY o.created_at DESC, o.id DESC, oi.created_at DESC
        LIMIT 1
      `
      )
      .get(customerId, productId) as { unitPrice?: unknown } | undefined;

    return Response.json({ unitPrice: asFiniteNumber(row?.unitPrice ?? null) }, { status: 200 });
  }
}
