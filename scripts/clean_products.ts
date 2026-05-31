import path from "node:path";

import Database from "better-sqlite3";

function envPath(name: string, fallback: string) {
  return (process.env[name] ?? fallback).trim();
}

function normalizeDigits(ref: string) {
  const digits = ref.replace(/[^\d]/g, "");
  return digits;
}

function isDigitsOnly(ref: string) {
  return /^\d+$/.test(ref);
}

async function main() {
  const dbPath = path.resolve(process.cwd(), envPath("DATABASE_PATH", "data/erp.db"));
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const used = new Set(
    (db.prepare("SELECT DISTINCT product_id pid FROM order_items").all() as { pid: string }[]).map(
      (r) => r.pid
    )
  );

  const rows = db
    .prepare(
      "SELECT id, reference FROM products WHERE reference = '' OR reference GLOB '*[^0-9]*'"
    )
    .all() as { id: string; reference: string }[];

  let updated = 0;
  let deleted = 0;
  const tx = db.transaction(() => {
    const updateStmt = db.prepare("UPDATE products SET reference = ? WHERE id = ?");
    const deleteStmt = db.prepare("DELETE FROM products WHERE id = ?");
    const existsStmt = db.prepare("SELECT 1 FROM products WHERE reference = ? LIMIT 1");

    for (const r of rows) {
      if (used.has(r.id)) continue;
      const digits = normalizeDigits(r.reference);
      if (digits && digits.length >= 6 && isDigitsOnly(digits) && !existsStmt.get(digits)) {
        updateStmt.run(digits, r.id);
        updated++;
      } else {
        deleteStmt.run(r.id);
        deleted++;
      }
    }
  });

  tx();
  db.close();

  console.log("Cleaned products:", { scanned: rows.length, updated, deleted });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

