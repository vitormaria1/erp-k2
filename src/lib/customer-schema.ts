import { getDb } from "./db";

type DbLike = ReturnType<typeof getDb>;

let customerSchemaReady = false;

export function ensureCustomerSchema(db: DbLike) {
  if (customerSchemaReady) return;

  db.exec("ALTER TABLE customers ADD COLUMN IF NOT EXISTS seller TEXT");
  db.exec("ALTER TABLE customers ALTER COLUMN seller SET DEFAULT 'VANDO'");
  db.exec("UPDATE customers SET seller = 'VANDO' WHERE seller IS NULL OR BTRIM(seller) = ''");

  customerSchemaReady = true;
}
