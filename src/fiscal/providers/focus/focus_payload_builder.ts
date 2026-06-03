import type { FiscalPayloadBuilder, ProductFiscalDataRepository } from "../../engine/ports";
import type { FiscalInvoiceDraft, TaxCalculationResult } from "../../engine/types";
import { FiscalValidationError } from "../../engine/errors";
import type { FiscalDbClient } from "../../infra/pg";
import { getConfiguredFocusAmbiente } from "./config";

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

export class FocusNFePayloadBuilder implements FiscalPayloadBuilder<Record<string, unknown>> {
  constructor(private readonly deps: { productFiscalDataRepo: ProductFiscalDataRepository }) {}

  async build(draft: FiscalInvoiceDraft, taxes: TaxCalculationResult[], opts?: { client?: FiscalDbClient }) {
    void taxes;
    const ambiente = getConfiguredFocusAmbiente();
    const client = opts?.client;

    const items = await Promise.all(
      draft.itens.map(async (item, idx) => {
        const fiscalData = client
          ? await loadProductFiscalDataViaClient(client, item.productId)
          : await this.deps.productFiscalDataRepo.getByProductId(item.productId);
        if (!fiscalData) throw new FiscalValidationError("Produto sem cadastro fiscal", { productId: item.productId });

        const desconto = item.desconto ?? 0;
        const bruto = item.quantidade * item.valorUnitario;
        const totalItem = bruto - desconto;

        const icmsRate = fiscalData.aliquotaIcms ?? 0;
        const pisRate = fiscalData.aliquotaPis ?? 0;
        const cofinsRate = fiscalData.aliquotaCofins ?? 0;

        return {
          numero_item: idx + 1,
          codigo_produto: item.productId,
          descricao: item.description,

          codigo_ncm: fiscalData.ncm,
          cest: fiscalData.cest ?? undefined,
          cfop: item.cfop,

          unidade_comercial: item.unidade,
          quantidade_comercial: item.quantidade,
          valor_unitario_comercial: round2(item.valorUnitario),
          valor_desconto: desconto ? round2(desconto) : undefined,
          valor_bruto: round2(bruto),
          inclui_no_total: 1,

          unidade_tributavel: fiscalData.unidadeTributavel,
          quantidade_tributavel: item.quantidade,
          valor_unitario_tributavel: round2(item.valorUnitario),

          icms_origem: fiscalData.origem,
          icms_situacao_tributaria: fiscalData.cstIcms,
          icms_modalidade_base_calculo: 3,
          icms_base_calculo: round2(totalItem),
          icms_aliquota: round2(icmsRate),
          icms_valor: round2((totalItem * icmsRate) / 100),

          pis_situacao_tributaria: fiscalData.cstPis,
          pis_base_calculo: round2(totalItem),
          pis_aliquota_porcentual: round2(pisRate),
          pis_valor: round2((totalItem * pisRate) / 100),

          cofins_situacao_tributaria: fiscalData.cstCofins,
          cofins_base_calculo: round2(totalItem),
          cofins_aliquota_porcentual: round2(cofinsRate),
          cofins_valor: round2((totalItem * cofinsRate) / 100),
        };
      })
    );

    const totalProdutos = items.reduce((acc, i) => acc + Number(i.valor_bruto ?? 0), 0);
    const totalDescontos = items.reduce((acc, i) => acc + Number(i.valor_desconto ?? 0), 0);
    const totalNF = round2(totalProdutos - totalDescontos);

    const base: Record<string, unknown> = {
      natureza_operacao: draft.naturezaOperacao,
      data_emissao: draft.dataEmissao,
      data_entrada_saida: draft.dataEntradaSaida ?? undefined,

      tipo_documento: draft.tipoDocumento,
      local_destino: draft.localDestino,
      finalidade_emissao: draft.finalidadeEmissao,
      consumidor_final: draft.consumidorFinal,
      presenca_comprador: draft.presencaComprador,

      // Para emissão real, `serie`/`numero` devem ser informados.
      serie: draft.numero ? String(draft.serie) : undefined,
      numero: draft.numero ? String(draft.numero) : undefined,

      cnpj_emitente: draft.issuer.cnpj,
      nome_emitente: draft.issuer.razaoSocial,
      nome_fantasia_emitente: draft.issuer.nomeFantasia ?? undefined,
      logradouro_emitente: draft.issuer.endereco.logradouro,
      numero_emitente: draft.issuer.endereco.numero,
      bairro_emitente: draft.issuer.endereco.bairro,
      municipio_emitente: draft.issuer.endereco.municipio,
      uf_emitente: draft.issuer.endereco.uf,
      cep_emitente: draft.issuer.endereco.cep,
      inscricao_estadual_emitente: draft.issuer.ie,
      regime_tributario_emitente: 3, // Lucro Real (Regime Normal)
      pais_emitente: "Brasil",

      // Regra comum em homologação: identificar sem valor fiscal.
      nome_destinatario:
        ambiente === "homologacao"
          ? "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
          : draft.recipient.nome,
      logradouro_destinatario: draft.recipient.endereco.logradouro,
      numero_destinatario: draft.recipient.endereco.numero,
      bairro_destinatario: draft.recipient.endereco.bairro,
      municipio_destinatario: draft.recipient.endereco.municipio,
      uf_destinatario: draft.recipient.endereco.uf,
      cep_destinatario: draft.recipient.endereco.cep,
      pais_destinatario: "Brasil",

      indicador_inscricao_estadual_destinatario: draft.recipient.contribuinteIcms ? 1 : 9,
      inscricao_estadual_destinatario: draft.recipient.contribuinteIcms ? (draft.recipient.ie ?? undefined) : undefined,

      valor_frete: 0,
      valor_seguro: 0,
      valor_outras_despesas: 0,
      valor_desconto: round2(totalDescontos),
      valor_produtos: round2(totalProdutos),
      valor_total: round2(totalNF),
      modalidade_frete: 9,

      items,
    };

    if (draft.recipient.cpfCnpj.length === 11) {
      base.cpf_destinatario = draft.recipient.cpfCnpj;
    } else {
      base.cnpj_destinatario = draft.recipient.cpfCnpj;
    }

    return { ...base, ...(draft.focusPayloadOverrides ?? {}) };
  }
}

async function loadProductFiscalDataViaClient(client: FiscalDbClient, productId: string) {
  const res = await client.query("SELECT * FROM fiscal_product_fiscal_data WHERE product_id = $1", [productId]);
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
  const row = (res.rows[0] as Row | undefined) ?? null;
  if (!row) return null;
  return {
    productId: row.product_id,
    ncm: row.ncm,
    cest: row.cest,
    origem: row.origem,
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
