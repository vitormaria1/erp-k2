import type { FiscalDbPool } from "../../infra/pg";
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
    if (!row) return null;
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
    if (!row) return null;
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      rules: (row.rules ?? {}) as Record<string, unknown>,
      active: row.active,
    };
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
    if (!row) return null;
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
}
