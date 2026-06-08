import { getDb } from "./db";

type DbLike = ReturnType<typeof getDb>;

let productSchemaReady = false;

export function ensureProductSchema(db: DbLike) {
  if (productSchemaReady) return;

  db.exec("ALTER TABLE products ADD COLUMN IF NOT EXISTS active BOOLEAN");
  db.exec("ALTER TABLE products ALTER COLUMN active SET DEFAULT TRUE");
  db.exec("UPDATE products SET active = TRUE WHERE active IS NULL");

  productSchemaReady = true;
}
