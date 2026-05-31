import "dotenv/config";

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { getFiscalDbPool } from "../src/fiscal/infra/pg";

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

async function runSqlBatch(
  pool: { query: (text: string, params?: ReadonlyArray<unknown>) => Promise<unknown> },
  sql: string
) {
  // PGlite rejects multi-statement prepared queries; run statement-by-statement.
  const parts = sql
    .split(/;\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    await pool.query(`${part};`);
  }
}

async function main() {
  const pool = getFiscalDbPool();
  const migrationsDir = path.join(process.cwd(), "db/fiscal/migrations");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fiscal_migrations (
      id bigserial PRIMARY KEY,
      name text NOT NULL UNIQUE,
      sha256 text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  for (const name of files) {
    const abs = path.join(migrationsDir, name);
    const sql = await readFile(abs, "utf-8");
    const hash = sha256(sql);

    const already = await pool.query(
      "SELECT sha256 FROM fiscal_migrations WHERE name = $1",
      [name]
    );

    if (already.rowCount) {
      const prev = (already.rows[0] as { sha256: string }).sha256;
      if (prev !== hash) {
        throw new Error(`Migration changed after apply: ${name}`);
      }
      continue;
    }

    await pool.query("BEGIN");
    try {
      await runSqlBatch(pool, sql);
      await pool.query("INSERT INTO fiscal_migrations (name, sha256) VALUES ($1, $2)", [name, hash]);
      await pool.query("COMMIT");
      console.log("Applied migration:", name);
    } catch (e) {
      await pool.query("ROLLBACK");
      throw e;
    }
  }
  console.log("Fiscal migrations OK");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
