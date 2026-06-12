import type { FiscalDbPool } from "../../infra/pg";
import {
  FISCAL_OPERATION_CODE_BONIFICACAO_5910,
  FISCAL_OPERATION_CODE_VENDA_INTERNA,
} from "../../config/operation_options";
import type {
  FiscalOperationRepository,
  FiscalProfileRepository,
  ProductFiscalDataRepository,
} from "../../engine/ports";
import type {
  FiscalOperation,
  FiscalProfile,
  Origem,
  ProductFiscalData,
  FinalidadeEmissao,
  LocalDestino,
  TipoDocumento,
} from "../../domain";

function onlyDigits(v: unknown) {
  return String(v ?? "").replace(/[^\d]/g, "");
}

function parseOrigem(v: unknown): Origem {
  const raw = String(v ?? "").trim();
  const digit = raw.match(/\d/);
  const n = digit ? Number(digit[0]) : 0;
  if (n >= 0 && n <= 8) return n as Origem;
  return 0;
}

function fallbackProductFiscalData(row: {
  id: string;
  unit: string | null;
  ClassFiscalNcm: string | null;
  CodigoCest: string | null;
  OrigemMercCst: string | null;
  UnidadeComercial: string | null;
}): ProductFiscalData | null {
  const ncm = onlyDigits(row.ClassFiscalNcm);
  if (!/^\d{8}$/.test(ncm)) return null;

  const cest = onlyDigits(row.CodigoCest);
  const unidadeTributavel = String(row.UnidadeComercial ?? row.unit ?? "UN").trim() || "UN";

  return {
    productId: row.id,
    ncm,
    cest: /^\d{7}$/.test(cest) ? cest : null,
    origem: parseOrigem(row.OrigemMercCst),
    unidadeTributavel,
    cstIcms: "00",
    cstPis: "01",
    cstCofins: "01",
    aliquotaIcms: 12,
    aliquotaPis: 0,
    aliquotaCofins: 0,
    cfopPadrao: "5101",
    beneficiosFiscais: [],
    tributacaoInterna: {},
    tributacaoInterestadual: {},
  };
}

export class ProductFiscalDataRepositoryPg implements ProductFiscalDataRepository {
  constructor(private readonly pool: FiscalDbPool) {}

  async getByProductId(productId: string): Promise<ProductFiscalData | null> {
    type Row = {
      product_id: string;
      ncm: string;
      cest: string | null;
      origem: number;
      unidade_tributavel: string;
      cst_icms: string;
      cst_pis: string;
      cst_cofins: string;
      aliquota_icms: string | null;
      aliquota_pis: string | null;
      aliquota_cofins: string | null;
      cfop_padrao: string;
      beneficios_fiscais: unknown;
      tributacao_interna: unknown;
      tributacao_interestadual: unknown;
    };

    const res = await this.pool.query("SELECT * FROM fiscal_product_fiscal_data WHERE product_id = $1", [
      productId,
    ]);
    const row = (res.rows[0] as Row | undefined) ?? null;
    if (row) {
      return {
        productId: row.product_id,
        ncm: row.ncm,
        cest: row.cest,
        origem: row.origem as Origem,
        unidadeTributavel: row.unidade_tributavel,
        cstIcms: row.cst_icms,
        cstPis: row.cst_pis,
        cstCofins: row.cst_cofins,
        aliquotaIcms: row.aliquota_icms == null ? undefined : Number(row.aliquota_icms),
        aliquotaPis: row.aliquota_pis == null ? undefined : Number(row.aliquota_pis),
        aliquotaCofins: row.aliquota_cofins == null ? undefined : Number(row.aliquota_cofins),
        cfopPadrao: row.cfop_padrao,
        beneficiosFiscais: Array.isArray(row.beneficios_fiscais) ? (row.beneficios_fiscais as string[]) : [],
        tributacaoInterna: (row.tributacao_interna ?? {}) as Record<string, unknown>,
        tributacaoInterestadual: (row.tributacao_interestadual ?? {}) as Record<string, unknown>,
      };
    }

    type ProductRow = {
      id: string;
      unit: string | null;
      ClassFiscalNcm: string | null;
      CodigoCest: string | null;
      OrigemMercCst: string | null;
      UnidadeComercial: string | null;
    };
    const fallbackRes = await this.pool.query(
      `
      SELECT
        id,
        unit,
        "Class.Fiscal/NCM" as "ClassFiscalNcm",
        "Código CEST" as "CodigoCest",
        "Origem Merc. CST" as "OrigemMercCst",
        "Unidade Comercial" as "UnidadeComercial"
      FROM products
      WHERE id = $1
    `,
      [productId]
    );
    const fallbackRow = (fallbackRes.rows[0] as ProductRow | undefined) ?? null;
    if (!fallbackRow) return null;
    return fallbackProductFiscalData(fallbackRow);
  }
}

export class FiscalProfileRepositoryPg implements FiscalProfileRepository {
  constructor(private readonly pool: FiscalDbPool) {}

  async getByCode(code: string): Promise<FiscalProfile | null> {
    type Row = {
      id: string;
      code: string;
      name: string;
      description: string | null;
      rules: unknown;
      active: boolean;
    };

    const res = await this.pool.query(
      "SELECT id, code, name, description, rules, active FROM fiscal_profiles WHERE code=$1 AND active=true",
      [code]
    );
    const row = (res.rows[0] as Row | undefined) ?? null;
    if (row) {
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
        rules: (row.rules ?? {}) as Record<string, unknown>,
        active: row.active,
      };
    }

    if (code === "PRODUCAO_PROPRIA") {
      return {
        id: "00000000-0000-0000-0000-000000000001",
        code,
        name: "Produção própria",
        description: "Fallback automático enquanto a base fiscal dedicada não está semeada.",
        rules: {},
        active: true,
      };
    }
    return null;
  }
}

export class FiscalOperationRepositoryPg implements FiscalOperationRepository {
  constructor(private readonly pool: FiscalDbPool) {}

  async getByCode(code: string): Promise<FiscalOperation | null> {
    type Row = {
      id: string;
      code: string;
      natureza_operacao: string;
      cfop: string;
      tipo_documento: number;
      finalidade_emissao: number;
      local_destino: number;
      consumidor_final: boolean;
      devolucao: boolean;
      bonificacao: boolean;
      active: boolean;
    };

    const res = await this.pool.query(
      `
      SELECT
        id, code, natureza_operacao, cfop, tipo_documento, finalidade_emissao, local_destino,
        consumidor_final, devolucao, bonificacao, active
      FROM fiscal_operations
      WHERE code=$1 AND active=true
    `,
      [code]
    );
    const row = (res.rows[0] as Row | undefined) ?? null;
    if (row) {
      return {
        id: row.id,
        code: row.code,
        naturezaOperacao: row.natureza_operacao,
        cfop: row.cfop,
        tipoDocumento: row.tipo_documento as TipoDocumento,
        finalidadeEmissao: row.finalidade_emissao as FinalidadeEmissao,
        localDestino: row.local_destino as LocalDestino,
        consumidorFinal: row.consumidor_final,
        devolucao: row.devolucao,
        bonificacao: row.bonificacao,
      };
    }

    if (code === FISCAL_OPERATION_CODE_VENDA_INTERNA) {
      return {
        id: "00000000-0000-0000-0000-000000000002",
        code,
        naturezaOperacao: "VENDA - PROD. INDU",
        cfop: "5101",
        tipoDocumento: 1,
        finalidadeEmissao: 1,
        localDestino: 1,
        consumidorFinal: false,
        devolucao: false,
        bonificacao: false,
      };
    }
    if (code === FISCAL_OPERATION_CODE_BONIFICACAO_5910) {
      return {
        id: "00000000-0000-0000-0000-000000000003",
        code,
        naturezaOperacao: "BONIFICACAO SIMPLES NACIONAL",
        cfop: "5910",
        tipoDocumento: 1,
        finalidadeEmissao: 1,
        localDestino: 1,
        consumidorFinal: false,
        devolucao: false,
        bonificacao: true,
      };
    }
    return null;
  }
}
