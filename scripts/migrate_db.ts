import { readFile } from "node:fs/promises";
import path from "node:path";

import Database from "better-sqlite3";

function envPath(name: string, fallback: string) {
  return (process.env[name] ?? fallback).trim();
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function ensureColumn(db: Database.Database, table: string, column: string, ddlType: string) {
  if (hasColumn(db, table, column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddlType}`);
}

async function main() {
  const dbPath = path.resolve(process.cwd(), envPath("DATABASE_PATH", "data/erp.db"));
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const schemaSql = await readFile(path.join(process.cwd(), "db/schema.sql"), "utf-8");
  db.exec(schemaSql);

  // Backfill columns for customers (schema evolution without drop/recreate)
  ensureColumn(db, "customers", "street", "TEXT");
  ensureColumn(db, "customers", "number", "TEXT");
  ensureColumn(db, "customers", "complement", "TEXT");
  ensureColumn(db, "customers", "neighborhood", "TEXT");
  ensureColumn(db, "customers", "city", "TEXT");
  ensureColumn(db, "customers", "uf", "TEXT");
  ensureColumn(db, "customers", "city_code", "TEXT");
  ensureColumn(db, "customers", "country", "TEXT");
  ensureColumn(db, "customers", "country_code", "TEXT");
  ensureColumn(db, "customers", "phone", "TEXT");
  ensureColumn(db, "customers", "email", "TEXT");

  // Backfill columns for stock_movements
  ensureColumn(db, "stock_movements", "unit_cost", "REAL");
  ensureColumn(db, "stock_movements", "reason_code", "TEXT");
  ensureColumn(db, "stock_movements", "note", "TEXT");
  ensureColumn(db, "stock_movements", "production_order_id", "TEXT");
  ensureColumn(db, "stock_movements", "purchase_invoice_id", "TEXT");
  ensureColumn(db, "stock_movements", "meta_json", "TEXT");

  // Backfill columns for production_orders
  ensureColumn(db, "production_orders", "status", "TEXT NOT NULL DEFAULT 'OPEN'");
  // SQLite não permite DEFAULT não-constante em ALTER TABLE ADD COLUMN.
  ensureColumn(db, "production_orders", "started_at", "TEXT");
  ensureColumn(db, "production_orders", "completed_at", "TEXT");

  // Backfill valores
  if (hasColumn(db, "production_orders", "started_at")) {
    db.exec(
      "UPDATE production_orders SET started_at = COALESCE(started_at, created_at, datetime('now'))"
    );
  }

  // Backfill reason_code/note a partir do campo legado "reason" (ex.: "PURCHASE:foo")
  if (hasColumn(db, "stock_movements", "reason") && hasColumn(db, "stock_movements", "reason_code")) {
    const rows = db
      .prepare("SELECT id, reason FROM stock_movements WHERE reason IS NOT NULL AND (reason_code IS NULL OR reason_code = '')")
      .all() as Array<{ id: string; reason: string }>;

    const upd = db.prepare("UPDATE stock_movements SET reason_code = ?, note = ? WHERE id = ?");
    for (const r of rows) {
      const raw = (r.reason ?? "").toString();
      const idx = raw.indexOf(":");
      if (idx === -1) {
        upd.run(raw || null, null, r.id);
      } else {
        const code = raw.slice(0, idx).trim();
        const note = raw.slice(idx + 1).trim();
        upd.run(code || null, note || null, r.id);
      }
    }
  }
  db.close();

  console.log("Migrated DB:", dbPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
