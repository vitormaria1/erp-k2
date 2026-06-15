import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { getFiscalDbPool } from "../infra/pg";
import { getDb } from "../../lib/db";
import { parseNfeProcXml } from "../xml/nfe_proc_parser";
import { randomUUID } from "node:crypto";

function onlyDigits(v: unknown) {
  return String(v ?? "").replace(/[^\d]/g, "");
}

function normalizeReference(v: string) {
  return String(v ?? "").trim();
}

function parseOrigem(v: unknown) {
  const raw = String(v ?? "").trim();
  const digit = raw.match(/\d/);
  const n = digit ? Number(digit[0]) : 0;
  return n >= 0 && n <= 8 ? n : 0;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function firstRecordValue(v: unknown): Record<string, unknown> | null {
  if (!isRecord(v)) return null;
  const values = Object.values(v);
  const first = values[0];
  return isRecord(first) ? first : null;
}

export type SeedFromXmlResult = {
  files: number;
  unreadableFiles: number;
  productsUpserted: number;
  profilesUpserted: number;
  operationsUpserted: number;
};

type ProductAggregate = {
  productId: string;
  ncmCounts: Map<string, number>;
  cestCounts: Map<string, number>;
  origemCounts: Map<string, number>;
  unidadeTributavelCounts: Map<string, number>;
  cstIcmsCounts: Map<string, number>;
  cstPisCounts: Map<string, number>;
  cstCofinsCounts: Map<string, number>;
  aliquotaIcmsCounts: Map<string, number>;
  aliquotaPisCounts: Map<string, number>;
  aliquotaCofinsCounts: Map<string, number>;
  cfopCounts: Map<string, number>;
};

function incrementCount(map: Map<string, number>, rawValue: unknown) {
  const value = String(rawValue ?? "").trim();
  if (!value) return;
  map.set(value, (map.get(value) ?? 0) + 1);
}

function pickMostFrequent(map: Map<string, number>, fallback = "") {
  let winner = fallback;
  let winnerCount = -1;
  for (const [value, count] of map.entries()) {
    if (count > winnerCount) {
      winner = value;
      winnerCount = count;
    }
  }
  return winner;
}

function getOrCreateAggregate(store: Map<string, ProductAggregate>, productId: string): ProductAggregate {
  const existing = store.get(productId);
  if (existing) return existing;

  const created: ProductAggregate = {
    productId,
    ncmCounts: new Map(),
    cestCounts: new Map(),
    origemCounts: new Map(),
    unidadeTributavelCounts: new Map(),
    cstIcmsCounts: new Map(),
    cstPisCounts: new Map(),
    cstCofinsCounts: new Map(),
    aliquotaIcmsCounts: new Map(),
    aliquotaPisCounts: new Map(),
    aliquotaCofinsCounts: new Map(),
    cfopCounts: new Map(),
  };
  store.set(productId, created);
  return created;
}

function buildProfileCode() {
  return "PRODUCAO_PROPRIA";
}

function buildOperationCode(args: { natOp: string; cfop: string; idDest: string }) {
  const nat = args.natOp
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return `${nat}_${args.cfop}_${args.idDest}`;
}

export async function seedFiscalFromXmlDir(dirRelOrAbs: string): Promise<SeedFromXmlResult> {
  const pool = getFiscalDbPool();
  const absDir = path.isAbsolute(dirRelOrAbs)
    ? dirRelOrAbs
    : path.join(/* turbopackIgnore: true */ process.cwd(), dirRelOrAbs);
  const files = (await readdir(absDir)).filter((f) => f.toLowerCase().endsWith(".xml")).sort();
  if (files.length === 0) throw new Error(`Nenhum XML encontrado em: ${absDir}`);

  const sqlite = getDb();
  const selectProductId = sqlite.prepare("SELECT id FROM products WHERE reference = ?");

  const profileCode = buildProfileCode();
  let profilesUpserted = 0;
  let operationsUpserted = 0;
  let productsUpserted = 0;
  let unreadableFiles = 0;
  const productAggregates = new Map<string, ProductAggregate>();

  // Canonical operation code used by the ERP (deterministic), derived from real XMLs.
  await pool.query(
    `
    INSERT INTO fiscal_operations (
      id, code, natureza_operacao, cfop, tipo_documento, finalidade_emissao, local_destino,
      consumidor_final, devolucao, bonificacao, active
    )
    VALUES ($1,'VENDA_INTERNA','VENDA - PROD. INDU','5101',1,1,1,false,false,false,true)
    ON CONFLICT (code) DO UPDATE SET
      natureza_operacao=excluded.natureza_operacao,
      cfop=excluded.cfop,
      tipo_documento=excluded.tipo_documento,
      finalidade_emissao=excluded.finalidade_emissao,
      local_destino=excluded.local_destino,
      consumidor_final=excluded.consumidor_final,
      updated_at=now(),
      active=true
  `,
    [randomUUID()]
  );

  for (const name of files) {
    let xml: string;
    try {
      xml = await readFile(path.join(absDir, name), "utf-8");
    } catch (error) {
      const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code === "EACCES") {
        unreadableFiles += 1;
        continue;
      }
      throw error;
    }
    const parsed = parseNfeProcXml(xml);

    // 1) Profile (fixo por enquanto; refinaremos depois por regras reais)
    const profileUpsert = await pool.query(
      `
      INSERT INTO fiscal_profiles (id, code, name, description, rules, active)
      VALUES ($1, $2, $3, $4, $5::jsonb, true)
      ON CONFLICT (code) DO UPDATE SET
        name=excluded.name,
        description=excluded.description,
        rules=excluded.rules,
        active=true,
        updated_at=now()
      RETURNING id
    `,
      [randomUUID(), profileCode, "Produção própria", "Seed inicial a partir de XMLs reais", JSON.stringify({})]
    );
    if (profileUpsert.rowCount) profilesUpserted = 1;

    // 2) Operation (por natOp/cfop/idDest)
    const cfop = String(parsed.det[0]!.prod.CFOP ?? "").trim();
    const operationCode = buildOperationCode({
      natOp: String(parsed.ide.natOp ?? "").trim(),
      cfop,
      idDest: String(parsed.ide.idDest ?? "").trim(),
    });

    const tipoDocumento = Number(parsed.ide.tpNF);
    const finalidadeEmissao = Number(parsed.ide.finNFe);
    const localDestino = Number(parsed.ide.idDest);
    const consumidorFinal = String(parsed.ide.indFinal) === "1";

    const opUpsert = await pool.query(
      `
      INSERT INTO fiscal_operations (
        id, code, natureza_operacao, cfop, tipo_documento, finalidade_emissao, local_destino,
        consumidor_final, devolucao, bonificacao, active
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,false,true)
      ON CONFLICT (code) DO UPDATE SET
        natureza_operacao=excluded.natureza_operacao,
        cfop=excluded.cfop,
        tipo_documento=excluded.tipo_documento,
        finalidade_emissao=excluded.finalidade_emissao,
        local_destino=excluded.local_destino,
        consumidor_final=excluded.consumidor_final,
        active=true,
        updated_at=now()
      RETURNING id
    `,
      [randomUUID(), operationCode, parsed.ide.natOp, cfop, tipoDocumento, finalidadeEmissao, localDestino, consumidorFinal]
    );
    if (opUpsert.rowCount) operationsUpserted += 1;

    // 3) Products fiscal data (por item)
    for (const det of parsed.det) {
      const cProd = normalizeReference(det.prod.cProd);
      const productRow = selectProductId.get(cProd) as { id: string } | undefined;
      if (!productRow) continue;

      const icmsAny = firstRecordValue(det.imposto?.ICMS ?? null);
      const origem = Number(icmsAny?.orig ?? 0);
      const cstIcms = String(icmsAny?.CST ?? icmsAny?.CSOSN ?? "00");
      const aliquotaIcms =
        icmsAny?.pICMS != null && typeof icmsAny.pICMS !== "object" ? Number(icmsAny.pICMS) : null;

      const pisAny = firstRecordValue(det.imposto?.PIS ?? null);
      const cstPis = String(pisAny?.CST ?? "01");
      const aliquotaPis =
        pisAny?.pPIS != null && typeof pisAny.pPIS !== "object" ? Number(pisAny.pPIS) : null;

      const cofAny = firstRecordValue(det.imposto?.COFINS ?? null);
      const cstCof = String(cofAny?.CST ?? "01");
      const aliquotaCof =
        cofAny?.pCOFINS != null && typeof cofAny.pCOFINS !== "object" ? Number(cofAny.pCOFINS) : null;

      const aggregate = getOrCreateAggregate(productAggregates, productRow.id);
      incrementCount(aggregate.ncmCounts, onlyDigits(String(det.prod.NCM)));
      incrementCount(aggregate.cestCounts, null);
      incrementCount(aggregate.origemCounts, origem);
      incrementCount(aggregate.unidadeTributavelCounts, String(det.prod.uTrib ?? det.prod.uCom ?? "UN").trim());
      incrementCount(aggregate.cstIcmsCounts, cstIcms);
      incrementCount(aggregate.cstPisCounts, cstPis);
      incrementCount(aggregate.cstCofinsCounts, cstCof);
      incrementCount(aggregate.aliquotaIcmsCounts, aliquotaIcms == null ? "" : aliquotaIcms.toFixed(4));
      incrementCount(aggregate.aliquotaPisCounts, aliquotaPis == null ? "" : aliquotaPis.toFixed(4));
      incrementCount(aggregate.aliquotaCofinsCounts, aliquotaCof == null ? "" : aliquotaCof.toFixed(4));
      incrementCount(aggregate.cfopCounts, String(det.prod.CFOP).trim());
    }
  }

  for (const aggregate of productAggregates.values()) {
    const ncm = pickMostFrequent(aggregate.ncmCounts);
    if (!ncm) continue;

    const cest = pickMostFrequent(aggregate.cestCounts);
    const origem = Number(pickMostFrequent(aggregate.origemCounts, "0"));
    const unidadeTributavel = pickMostFrequent(aggregate.unidadeTributavelCounts, "UN");
    const cstIcms = pickMostFrequent(aggregate.cstIcmsCounts, "00");
    const cstPis = pickMostFrequent(aggregate.cstPisCounts, "01");
    const cstCof = pickMostFrequent(aggregate.cstCofinsCounts, "01");
    const aliquotaIcms = pickMostFrequent(aggregate.aliquotaIcmsCounts);
    const aliquotaPis = pickMostFrequent(aggregate.aliquotaPisCounts);
    const aliquotaCof = pickMostFrequent(aggregate.aliquotaCofinsCounts);
    const cfop = pickMostFrequent(aggregate.cfopCounts, "5101");

    await pool.query(
      `
      INSERT INTO fiscal_product_fiscal_data (
        product_id, ncm, cest, origem, unidade_tributavel, cst_icms, cst_pis, cst_cofins,
        aliquota_icms, aliquota_pis, aliquota_cofins, cfop_padrao,
        beneficios_fiscais, tributacao_interna, tributacao_interestadual
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'[]'::jsonb,'{}'::jsonb,'{}'::jsonb)
      ON CONFLICT (product_id) DO UPDATE SET
        ncm=excluded.ncm,
        cest=excluded.cest,
        origem=excluded.origem,
        unidade_tributavel=excluded.unidade_tributavel,
        cst_icms=excluded.cst_icms,
        cst_pis=excluded.cst_pis,
        cst_cofins=excluded.cst_cofins,
        aliquota_icms=excluded.aliquota_icms,
        aliquota_pis=excluded.aliquota_pis,
        aliquota_cofins=excluded.aliquota_cofins,
        cfop_padrao=excluded.cfop_padrao,
        updated_at=now()
    `,
      [
        aggregate.productId,
        ncm,
        /^\d{7}$/.test(cest) ? cest : null,
        origem,
        unidadeTributavel,
        cstIcms,
        cstPis,
        cstCof,
        aliquotaIcms || null,
        aliquotaPis || null,
        aliquotaCof || null,
        cfop,
      ]
    );
    productsUpserted += 1;
  }

  type ProductFallbackRow = {
    id: string;
    unit: string | null;
    ClassFiscalNcm: string | null;
    CodigoCest: string | null;
    OrigemMercCst: string | null;
    UnidadeComercial: string | null;
  };
  const fallbackProducts = await pool.query(
    `
    SELECT
      id,
      unit,
      "Class.Fiscal/NCM" as "ClassFiscalNcm",
      "Código CEST" as "CodigoCest",
      "Origem Merc. CST" as "OrigemMercCst",
      "Unidade Comercial" as "UnidadeComercial"
    FROM products
  `
  );

  for (const row of fallbackProducts.rows as ProductFallbackRow[]) {
    if (productAggregates.has(row.id)) continue;

    const ncm = onlyDigits(row.ClassFiscalNcm);
    if (!/^\d{8}$/.test(ncm)) continue;

    const cest = onlyDigits(row.CodigoCest);
    const unidadeTributavel = String(row.UnidadeComercial ?? row.unit ?? "UN").trim() || "UN";

    await pool.query(
      `
      INSERT INTO fiscal_product_fiscal_data (
        product_id, ncm, cest, origem, unidade_tributavel, cst_icms, cst_pis, cst_cofins,
        aliquota_icms, aliquota_pis, aliquota_cofins, cfop_padrao,
        beneficios_fiscais, tributacao_interna, tributacao_interestadual
      )
      VALUES ($1,$2,$3,$4,$5,'00','01','01',12,0,0,'5101','[]'::jsonb,'{}'::jsonb,'{}'::jsonb)
      ON CONFLICT (product_id) DO UPDATE SET
        ncm=excluded.ncm,
        cest=excluded.cest,
        origem=excluded.origem,
        unidade_tributavel=excluded.unidade_tributavel,
        cst_icms=excluded.cst_icms,
        cst_pis=excluded.cst_pis,
        cst_cofins=excluded.cst_cofins,
        aliquota_icms=excluded.aliquota_icms,
        aliquota_pis=excluded.aliquota_pis,
        aliquota_cofins=excluded.aliquota_cofins,
        cfop_padrao=excluded.cfop_padrao,
        updated_at=now()
    `,
      [row.id, ncm, /^\d{7}$/.test(cest) ? cest : null, parseOrigem(row.OrigemMercCst), unidadeTributavel]
    );
    productsUpserted += 1;
  }

  return { files: files.length, unreadableFiles, productsUpserted, profilesUpserted, operationsUpserted };
}
