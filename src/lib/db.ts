import path from "node:path";

import Database from "better-sqlite3";

let singleton: Database.Database | null = null;

export function getDb() {
  if (singleton) return singleton;
  const dbPath = process.env.DATABASE_PATH ?? "data/erp.db";
  singleton = new Database(path.resolve(dbPath));
  singleton.pragma("foreign_keys = ON");
  return singleton;
}
