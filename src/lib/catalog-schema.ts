import { getDb } from "./db";

type DbLike = ReturnType<typeof getDb>;

let productSchemaReady = false;

export const PRODUCT_KIND_VALUES = ["PRODUTO", "INSUMO"] as const;
export type ProductKind = (typeof PRODUCT_KIND_VALUES)[number];

export function ensureProductSchema(db: DbLike) {
  if (productSchemaReady) return;

  db.exec("ALTER TABLE products ADD COLUMN IF NOT EXISTS active BOOLEAN");
  db.exec("ALTER TABLE products ALTER COLUMN active SET DEFAULT TRUE");
  db.exec("UPDATE products SET active = TRUE WHERE active IS NULL");
  db.exec("ALTER TABLE products ADD COLUMN IF NOT EXISTS kind TEXT");
  db.exec("ALTER TABLE products ALTER COLUMN kind SET DEFAULT 'PRODUTO'");
  db.exec(`
    UPDATE products
    SET kind = 'PRODUTO'
    WHERE kind IS NULL
      OR BTRIM(kind) = ''
      OR UPPER(BTRIM(kind)) IN ('UNKNOWN', 'SEM_TIPO', 'TIPO', 'PRODUTO ACABADO')
  `);
  db.exec(`
    UPDATE products
    SET kind = 'INSUMO'
    WHERE UPPER(BTRIM(kind)) IN ('INSUMO', 'ISUMO')
  `);
  db.exec(`
    UPDATE products
    SET kind = CASE
      WHEN UPPER(BTRIM(kind)) = 'INSUMO' THEN 'INSUMO'
      ELSE 'PRODUTO'
    END
  `);

  productSchemaReady = true;
}
