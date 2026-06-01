import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

function envPath(name, fallback) {
  return String(process.env[name] ?? fallback).trim();
}

function nonEmptyOrNull(value) {
  const v = String(value ?? "").trim();
  return v.length ? v : null;
}

function sanitizeReference(raw) {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  const digits = v.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.length < 6) return null;
  return digits;
}

async function readJson(absPath) {
  const raw = await readFile(absPath, "utf-8");
  return JSON.parse(raw);
}

async function main() {
  const dbPath = path.resolve(envPath("DATABASE_PATH", "/app/data/erp.db"));
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const schemaPath = envPath("ERP_SCHEMA_PATH", "/app/db/schema.sql");
  const productsPath = envPath("ERP_PRODUCTS_JSON", "/app/seed-data/products.json");
  const clientsPath = envPath("ERP_CLIENTS_JSON", "/app/seed-data/clients.json");

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const schemaSql = await readFile(schemaPath, "utf-8");
  db.exec(schemaSql);

  // Se não tiver seed, só garante o schema.
  const hasProducts = fs.existsSync(productsPath);
  const hasClients = fs.existsSync(clientsPath);
  if (!hasProducts || !hasClients) {
    db.close();
    console.log("DB schema ready (no seed files):", dbPath);
    return;
  }

  const products = await readJson(productsPath);
  const clients = await readJson(clientsPath);

  const selectCustomerId = db.prepare("SELECT id FROM customers WHERE code = ?");
  const upsertCustomer = db.prepare(`
    INSERT INTO customers (id, code, cnpj, state_tax_id, taxpayer, name, trade_name, cep, updated_at)
    VALUES (@id, @code, @cnpj, @state_tax_id, @taxpayer, @name, @trade_name, @cep, datetime('now'))
    ON CONFLICT(code) DO UPDATE SET
      cnpj=excluded.cnpj,
      state_tax_id=excluded.state_tax_id,
      taxpayer=excluded.taxpayer,
      name=excluded.name,
      trade_name=excluded.trade_name,
      cep=excluded.cep,
      updated_at=datetime('now')
  `);

  const selectProductId = db.prepare("SELECT id FROM products WHERE reference = ?");
  const upsertProduct = db.prepare(`
    INSERT INTO products (id, reference, tele_ref, barcode, gtin, description, composition, unit, updated_at)
    VALUES (@id, @reference, @tele_ref, @barcode, @gtin, @description, @composition, @unit, datetime('now'))
    ON CONFLICT(reference) DO UPDATE SET
      tele_ref=excluded.tele_ref,
      barcode=excluded.barcode,
      gtin=excluded.gtin,
      description=excluded.description,
      composition=excluded.composition,
      unit=excluded.unit,
      updated_at=datetime('now')
  `);

  const tx = db.transaction(() => {
    for (const c of clients) {
      const code = String(c["Cod.Cadastro"] ?? "").trim();
      if (!code) continue;
      const existing = selectCustomerId.get(code);
      upsertCustomer.run({
        id: existing?.id ?? randomUUID(),
        code,
        cnpj: nonEmptyOrNull(c.CNPJ),
        state_tax_id: nonEmptyOrNull(c["Inscr. Estadual"]),
        taxpayer: String(c["Contribuinte S/N"] ?? "").trim().toUpperCase() === "S" ? 1 : 0,
        name: String(c.Nome ?? "").trim() || code,
        trade_name: nonEmptyOrNull(c["Nome Fantasia"]),
        cep: nonEmptyOrNull(c.CEP),
      });
    }

    for (const p of products) {
      const reference = sanitizeReference(p["Nr.Referencia"]);
      if (!reference) continue;
      const existing = selectProductId.get(reference);
      upsertProduct.run({
        id: existing?.id ?? randomUUID(),
        reference,
        tele_ref: nonEmptyOrNull(p["Ref.Tele."]),
        barcode: nonEmptyOrNull(p["Nr.CodBarras"]),
        gtin: nonEmptyOrNull(p["Nr. GTIN Tributavel"]),
        description: String(p["Descr.Prod."] ?? "").trim() || reference,
        composition: nonEmptyOrNull(p.Composicao),
        unit: String(p.Un ?? "").trim() || "UN",
      });
    }
  });

  tx();
  db.close();

  console.log("DB ready:", dbPath);
}

main().catch((e) => {
  console.error("init-db-runtime failed:", e);
  process.exit(1);
});

