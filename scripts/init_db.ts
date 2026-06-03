import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

type ProductRow = {
  "Nr.Referencia": string;
  "Ref.Tele.": string;
  "Nr.CodBarras": string;
  "Nr. GTIN Tributavel": string;
  "Descr.Prod.": string;
  Composicao: string;
  Un: string;
};

type ClientRow = Record<string, string | undefined>;

function envPath(name: string, fallback: string) {
  return (process.env[name] ?? fallback).trim();
}

function nonEmptyOrNull(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  return v.length ? v : null;
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function readField(row: ClientRow, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const direct = row[alias];
    if (direct !== undefined && String(direct).trim()) return direct;
  }

  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.has(normalizeHeader(key)) && String(value ?? "").trim()) return value;
  }

  return undefined;
}

function yesNoFlag(value: string | undefined): number {
  const normalized = normalizeHeader(value ?? "");
  return ["s", "sim", "y", "yes", "true", "1"].includes(normalized) ? 1 : 0;
}

function splitCityUf(raw: string | undefined): { city: string | null; uf: string | null } {
  const value = nonEmptyOrNull(raw);
  if (!value) return { city: null, uf: null };
  const match = value.match(/^(.*?)(?:\s*\/\s*([A-Z]{2}))$/);
  if (!match) return { city: value, uf: null };
  return { city: match[1].trim() || null, uf: match[2].trim() || null };
}

function sanitizeReference(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const digits = v.replace(/[^\d]/g, "");
  if (!digits) return null;
  return digits;
}

async function readJson<T>(relPath: string): Promise<T> {
  const abs = path.join(process.cwd(), relPath);
  const raw = await readFile(abs, "utf-8");
  return JSON.parse(raw) as T;
}

async function main() {
  const dbPath = path.resolve(process.cwd(), envPath("DATABASE_PATH", "data/erp.db"));
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const schemaSql = await readFile(path.join(process.cwd(), "db/schema.sql"), "utf-8");
  db.exec(schemaSql);

  const products = await readJson<ProductRow[]>("data/products.json");
  const clients = await readJson<ClientRow[]>("data/clients.json");

  const selectCustomerId = db.prepare("SELECT id FROM customers WHERE code = ?");
  const upsertCustomer = db.prepare(`
    INSERT INTO customers (
      id, code, cnpj, state_tax_id, taxpayer, name, trade_name, cep,
      street, number, complement, neighborhood, city, uf, city_code,
      country, country_code, phone, email, home_page, tracks_orders,
      registered_at, last_updated_at, blocked, block_reason, customer_type_code, updated_at
    )
    VALUES (
      @id, @code, @cnpj, @state_tax_id, @taxpayer, @name, @trade_name, @cep,
      @street, @number, @complement, @neighborhood, @city, @uf, @city_code,
      @country, @country_code, @phone, @email, @home_page, @tracks_orders,
      @registered_at, @last_updated_at, @blocked, @block_reason, @customer_type_code, datetime('now')
    )
    ON CONFLICT(code) DO UPDATE SET
      cnpj=excluded.cnpj,
      state_tax_id=excluded.state_tax_id,
      taxpayer=excluded.taxpayer,
      name=excluded.name,
      trade_name=excluded.trade_name,
      cep=excluded.cep,
      street=excluded.street,
      number=excluded.number,
      complement=excluded.complement,
      neighborhood=excluded.neighborhood,
      city=excluded.city,
      uf=excluded.uf,
      city_code=excluded.city_code,
      country=excluded.country,
      country_code=excluded.country_code,
      phone=excluded.phone,
      email=excluded.email,
      home_page=excluded.home_page,
      tracks_orders=excluded.tracks_orders,
      registered_at=excluded.registered_at,
      last_updated_at=excluded.last_updated_at,
      blocked=excluded.blocked,
      block_reason=excluded.block_reason,
      customer_type_code=excluded.customer_type_code,
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
    db.exec("CREATE TEMP TABLE IF NOT EXISTS seed_products (reference TEXT PRIMARY KEY)");
    const clearSeedProducts = db.prepare("DELETE FROM seed_products");
    const insertSeedProduct = db.prepare("INSERT OR IGNORE INTO seed_products (reference) VALUES (?)");
    const purgeStaleProducts = db.prepare(`
      DELETE FROM products
      WHERE NOT EXISTS (
        SELECT 1
        FROM seed_products sp
        WHERE sp.reference = products.reference
      )
      AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = products.id)
      AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.product_id = products.id)
      AND NOT EXISTS (SELECT 1 FROM production_order_products pop WHERE pop.product_id = products.id)
      AND NOT EXISTS (SELECT 1 FROM production_order_inputs poi WHERE poi.input_product_id = products.id)
      AND NOT EXISTS (SELECT 1 FROM purchase_invoice_items pii WHERE pii.product_id = products.id)
      AND NOT EXISTS (
        SELECT 1
        FROM product_recipes pr
        WHERE pr.product_id = products.id OR pr.input_product_id = products.id
      )
    `);

    clearSeedProducts.run();
    for (const p of products) {
      const reference = sanitizeReference(p["Nr.Referencia"]);
      if (reference) insertSeedProduct.run(reference);
    }

    for (const c of clients) {
      const code = readField(c, ["Cod.Cadastro", "Código", "Codigo", "Cod Cadastro"])?.trim();
      if (!code) continue;
      const existing = selectCustomerId.get(code) as { id: string } | undefined;
      const cityUf = splitCityUf(readField(c, ["Cidade/UF Cliente", "Cidade/UF"]));

      upsertCustomer.run({
        id: existing?.id ?? randomUUID(),
        code,
        cnpj: nonEmptyOrNull(readField(c, ["CNPJ", "CPF/CNPJ", "CPF CNPJ", "CPF"])),
        state_tax_id: nonEmptyOrNull(readField(c, ["Inscr. Estadual", "Inscrição Estadual", "IE"])),
        taxpayer: yesNoFlag(readField(c, ["Contribuinte S/N", "Contribuinte", "Contribuinte SN"])),
        name: (readField(c, ["Nome", "Razão Social", "Razao Social"]) ?? "").trim() || code,
        trade_name: nonEmptyOrNull(readField(c, ["Nome Fantasia", "Fantasia"])),
        cep: nonEmptyOrNull(readField(c, ["CEP", "Cep"])),
        street: nonEmptyOrNull(readField(c, ["Endereço", "Endereco", "Logradouro", "Rua"])),
        number: nonEmptyOrNull(readField(c, ["Número", "Numero", "Numero End.", "Número End.", "Nº", "Nr.", "Nro"])),
        complement: nonEmptyOrNull(readField(c, ["Complemento", "Compl."])),
        neighborhood: nonEmptyOrNull(readField(c, ["Bairro"])),
        city: cityUf.city ?? nonEmptyOrNull(readField(c, ["Cidade", "Município", "Municipio"])),
        uf: cityUf.uf ?? nonEmptyOrNull(readField(c, ["UF", "Estado"])),
        city_code: nonEmptyOrNull(readField(c, ["Cod.Cidade", "Cod.Mun", "Cod. Município", "Código Município", "Codigo Municipio", "cMun"])),
        country: nonEmptyOrNull(readField(c, ["País", "Pais", "País Nome", "Pais Nome", "xPais"])),
        country_code: nonEmptyOrNull(readField(c, ["Cod.País", "Cod.Pais", "Código País", "Codigo Pais", "cPais"])),
        phone: nonEmptyOrNull(readField(c, ["Fone", "Telefone", "Celular", "Phone"])),
        email: nonEmptyOrNull(readField(c, ["e-mail", "E-mail", "Email", "e-mail para NF-e"])),
        home_page: nonEmptyOrNull(readField(c, ["Home Page", "Homepage", "Site"])),
        tracks_orders: yesNoFlag(readField(c, ["Acompanha Pedidos?", "Acompanha Pedidos", "Acompanha Pedido"])),
        registered_at: nonEmptyOrNull(readField(c, ["Data Cad.", "Data Cadastro", "Data Cad", "Cadastro Em"])),
        last_updated_at: nonEmptyOrNull(readField(c, ["Ultima Atualiz.", "Última Atualiz.", "Ultima Atualizacao", "Última Atualização"])),
        blocked: yesNoFlag(readField(c, ["Bloqueado?", "Bloqueado"])),
        block_reason: nonEmptyOrNull(readField(c, ["Motivo Bloqueio", "Motivo Bloqueado"])),
        customer_type_code: nonEmptyOrNull(readField(c, ["Cod.TP Cad.", "Cod TP Cad", "Código Tipo Cadastro", "Codigo Tipo Cadastro"])),
      });
    }

    for (const p of products) {
      const reference = sanitizeReference(p["Nr.Referencia"]);
      if (!reference) continue;
      const existing = selectProductId.get(reference) as { id: string } | undefined;

      upsertProduct.run({
        id: existing?.id ?? randomUUID(),
        reference,
        tele_ref: nonEmptyOrNull(p["Ref.Tele."]),
        barcode: nonEmptyOrNull(p["Nr.CodBarras"]),
        gtin: nonEmptyOrNull(p["Nr. GTIN Tributavel"]),
        description: (p["Descr.Prod."] ?? "").trim() || reference,
        composition: nonEmptyOrNull(p.Composicao),
        unit: (p.Un ?? "").trim() || "UN",
      });
    }

    purgeStaleProducts.run();
  });

  tx();
  db.close();

  console.log("DB ready:", dbPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
