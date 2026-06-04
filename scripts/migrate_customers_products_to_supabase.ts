import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { Client } from "pg";

function quoteIdent(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

function getSourceDb() {
  const dbPath = path.resolve(process.cwd(), (process.env.DATABASE_PATH ?? "data/erp.db").trim());
  if (!fs.existsSync(dbPath)) {
    throw new Error(`SQLite source not found: ${dbPath}`);
  }
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  return db;
}

function getDestClient() {
  const connectionString = (process.env.DATABASE_URL ?? "").trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL ausente. Passe a connection string do Supabase para rodar a migração.");
  }
  const url = new URL(connectionString);
  const ssl =
    url.hostname.includes("supabase.co") || connectionString.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined;
  return new Client({ connectionString, ssl });
}

async function ensureBaseSchema(client: Client) {
  const schemaSql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/0001_customers_products.sql"), "utf-8");
  for (const statement of schemaSql
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)) {
    await client.query(statement);
  }
}

async function ensureColumns(client: Client, sourceDb: Database.Database, tableName: string) {
  const sourceColumns = sourceDb.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (sourceColumns.length === 0) return;

  const existing = await client.query(
    `
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = $1
  `,
    [tableName]
  );
  const existingCols = new Set(existing.rows.map((row) => String((row as { column_name: string }).column_name)));

  for (const col of sourceColumns.map((row) => row.name)) {
    if (existingCols.has(col)) continue;
    await client.query(`alter table ${quoteIdent(tableName)} add column ${quoteIdent(col)} text`);
  }
}

async function copyTable(
  client: Client,
  sourceDb: Database.Database,
  sourceTable: string,
  destTable: string = sourceTable
) {
  const columns = (sourceDb.prepare(`PRAGMA table_info(${sourceTable})`).all() as Array<{ name: string }>).map(
    (row) => row.name
  );
  if (columns.length === 0) return;

  const rows = sourceDb.prepare(`select * from ${quoteIdent(sourceTable)}`).all() as Array<Record<string, unknown>>;
  if (rows.length === 0) return;

  const quotedColumns = columns.map(quoteIdent).join(", ");
  const maxParams = 50000;
  const chunkSize = Math.max(1, Math.floor(maxParams / Math.max(columns.length, 1)));

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const valuesSql = chunk
      .map((row, idx) => {
        const base = idx * columns.length;
        const placeholders = columns.map((_, colIdx) => `$${base + colIdx + 1}`).join(", ");
        return `(${placeholders})`;
      })
      .join(", ");
    const values = chunk.flatMap((row) => columns.map((col) => row[col] ?? null));

    await client.query(`insert into ${destTable} (${quotedColumns}) values ${valuesSql}`, values);
  }
}

async function main() {
  const sourceDb = getSourceDb();
  const client = getDestClient();
  const orderedTables = [
    "fiscal_jobs",
    "fiscal_events",
    "fiscal_invoices",
    "fiscal_sequences",
    "fiscal_operations",
    "fiscal_profiles",
    "fiscal_product_fiscal_data",
    "route_entries",
    "route_weeks",
    "purchase_invoice_items",
    "purchase_invoices",
    "production_order_inputs",
    "production_order_products",
    "production_orders",
    "loading_orders",
    "loadings",
    "boletos",
    "receivables",
    "invoices",
    "stock_movements",
    "order_items",
    "orders",
    "product_recipes",
    "products",
    "customers",
  ];

  await client.connect();
  try {
    await client.query("begin");
    for (const tableName of orderedTables) {
      await client.query(`drop table if exists ${quoteIdent(tableName)} cascade`);
    }
    await ensureBaseSchema(client);
    for (const tableName of orderedTables.slice().reverse()) {
      if (!sourceDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName)) {
        continue;
      }
      await ensureColumns(client, sourceDb, tableName);
      await copyTable(client, sourceDb, tableName);
    }
    await client.query("commit");
    console.log("Migração concluída para Supabase: esquema e dados do ERP importados.");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    sourceDb.close();
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
