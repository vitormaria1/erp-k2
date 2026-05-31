import "dotenv/config";

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

function onlyDigits(v: string | null | undefined) {
  return String(v ?? "").replace(/[^\d]/g, "");
}

function block(xml: string, tag: string) {
  return xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? "";
}

function val(blockText: string, tag: string) {
  return blockText.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`))?.[1] ?? null;
}

function openDb() {
  const dbPath = process.env.DATABASE_PATH ?? "data/erp.db";
  const db = new Database(path.resolve(dbPath));
  db.pragma("foreign_keys = ON");
  return db;
}

async function main() {
  const xmlDir = process.argv[2] ?? "NFes_09572986000149_01052026a26052026";
  const absDir = path.isAbsolute(xmlDir) ? xmlDir : path.join(process.cwd(), xmlDir);
  const files = readdirSync(absDir).filter((f) => f.toLowerCase().endsWith(".xml"));
  if (!files.length) throw new Error(`Nenhum XML em: ${absDir}`);

  const db = openDb();

  const update = db.prepare(`
    UPDATE customers SET
      state_tax_id = COALESCE(state_tax_id, @state_tax_id),
      cep = COALESCE(cep, @cep),
      street = COALESCE(street, @street),
      number = COALESCE(number, @number),
      complement = COALESCE(complement, @complement),
      neighborhood = COALESCE(neighborhood, @neighborhood),
      city = COALESCE(city, @city),
      uf = COALESCE(uf, @uf),
      city_code = COALESCE(city_code, @city_code),
      country = COALESCE(country, @country),
      country_code = COALESCE(country_code, @country_code),
      phone = COALESCE(phone, @phone),
      email = COALESCE(email, @email),
      updated_at = datetime('now')
    WHERE REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', '') = @cnpj
  `);

  let updated = 0;
  for (const f of files) {
    const xml = readFileSync(path.join(absDir, f), "utf-8");
    const destBlock = block(xml, "dest");
    const enderDestBlock = block(xml, "enderDest");
    const cnpj = onlyDigits(val(destBlock, "CNPJ"));
    if (!cnpj || cnpj.length !== 14) continue;

    const row = update.run({
      cnpj,
      state_tax_id: onlyDigits(val(destBlock, "IE")) || null,
      cep: onlyDigits(val(enderDestBlock, "CEP")) || null,
      street: val(enderDestBlock, "xLgr"),
      number: val(enderDestBlock, "nro"),
      complement: val(enderDestBlock, "xCpl"),
      neighborhood: val(enderDestBlock, "xBairro"),
      city: val(enderDestBlock, "xMun"),
      uf: val(enderDestBlock, "UF"),
      city_code: onlyDigits(val(enderDestBlock, "cMun")) || null,
      country: val(enderDestBlock, "xPais"),
      country_code: onlyDigits(val(enderDestBlock, "cPais")) || null,
      phone: onlyDigits(val(enderDestBlock, "fone")) || null,
      email: val(destBlock, "email"),
    });
    if (row.changes) updated += 1;
  }

  db.close();
  console.log("Customers enriched from XMLs:", { updated, files: files.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
