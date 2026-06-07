import { getDb } from "./db";

type DbLike = ReturnType<typeof getDb>;

let customerSchemaReady = false;

export const ROUTE_WEEKDAYS = [1, 2, 3, 4, 5] as const;
export type RouteWeekday = (typeof ROUTE_WEEKDAYS)[number];

export function routeWeekdayLabel(weekday: RouteWeekday) {
  switch (weekday) {
    case 1:
      return "Segunda";
    case 2:
      return "Terça";
    case 3:
      return "Quarta";
    case 4:
      return "Quinta";
    case 5:
      return "Sexta";
  }
}

export function normalizeRouteWeekdays(values: Iterable<number>) {
  const unique = new Set<RouteWeekday>();
  for (const value of values) {
    if (ROUTE_WEEKDAYS.includes(value as RouteWeekday)) unique.add(value as RouteWeekday);
  }
  return Array.from(unique).sort((a, b) => a - b);
}

export function syncCustomerRouteDays(db: DbLike, customerId: string, weekdays: number[]) {
  ensureCustomerSchema(db);
  const normalized = normalizeRouteWeekdays(weekdays);

  db.prepare("DELETE FROM customer_route_days WHERE customer_id = ?").run(customerId);
  const insert = db.prepare("INSERT INTO customer_route_days (customer_id, weekday) VALUES (?, ?)");
  for (const weekday of normalized) {
    insert.run(customerId, weekday);
  }
}

export function ensureCustomerRouteDay(db: DbLike, customerId: string, weekday: number) {
  ensureCustomerSchema(db);
  const normalized = normalizeRouteWeekdays([weekday]);
  if (normalized.length === 0) return;

  db.prepare(
    `
    INSERT INTO customer_route_days (customer_id, weekday)
    SELECT ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM customer_route_days WHERE customer_id = ? AND weekday = ?
    )
  `
  ).run(customerId, normalized[0], customerId, normalized[0]);
}

export function ensureCustomerSchema(db: DbLike) {
  if (customerSchemaReady) return;

  db.exec("ALTER TABLE customers ADD COLUMN IF NOT EXISTS seller TEXT");
  db.exec("ALTER TABLE customers ALTER COLUMN seller SET DEFAULT 'VANDO'");
  db.exec("UPDATE customers SET seller = 'VANDO' WHERE seller IS NULL OR BTRIM(seller) = ''");
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_route_days (
      customer_id UUID NOT NULL,
      weekday INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (customer_id, weekday),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_customer_route_days_customer ON customer_route_days(customer_id)");
  db.exec("DELETE FROM customer_route_days WHERE weekday NOT BETWEEN 1 AND 5");

  customerSchemaReady = true;
}
