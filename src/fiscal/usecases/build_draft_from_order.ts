import { randomUUID } from "node:crypto";

import { getDb } from "../../lib/db";
import {
  ensureOrderPaymentSchema,
  getFocusPaymentCode,
  getPaymentIndicator,
  type OrderPaymentMethod,
} from "../../lib/payments";
import { getIssuerConfig } from "../config/issuer";
import { getNfeDefaults, pickNfeDefaultsByAmbiente } from "../config/nfe_defaults";
import { isPedidoFiscalOperationCode } from "../config/operation_options";
import { getFiscalDbPool } from "../infra/pg";
import { FiscalOperationRepositoryPg, ProductFiscalDataRepositoryPg } from "../persistence/pg";
import { FiscalValidationError } from "../engine/errors";
import { getConfiguredFocusAmbiente } from "../providers/focus";

function onlyDigits(v: string | null | undefined) {
  return String(v ?? "").replace(/[^\d]/g, "");
}

function asIbgeCityCode(v: string | null | undefined) {
  const digits = onlyDigits(v);
  return /^\d{7}$/.test(digits) ? digits : null;
}

type OrderRow = {
  id: number;
  createdAt: string;
  customerId: string;
  paymentMethod: OrderPaymentMethod;
  customerCode: string | null;

  customerName: string;
  customerTradeName: string | null;
  customerCnpj: string | null;
  customerIe: string | null;
  taxpayer: number;

  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  uf: string | null;
  cep: string | null;
  cityCode: string | null;
};

type ReceivableRow = {
  id: string;
  amount: number;
  dueDate: string;
  method: OrderPaymentMethod;
};

type ItemRow = {
  itemId: string;
  productId: string;
  productCode: string | null;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
};

function loadOrder(orderId: number): { order: OrderRow; items: ItemRow[]; receivables: ReceivableRow[] } {
  const db = getDb();
  ensureOrderPaymentSchema(db);

  const order = db
    .prepare(
      `
      SELECT
        o.id as id,
        o.created_at as createdAt,
        o.customer_id as customerId,
        o.payment_method as paymentMethod,

        c.code as customerCode,
        c.name as customerName,
        c.trade_name as customerTradeName,
        c.cnpj as customerCnpj,
        c.state_tax_id as customerIe,
        c.taxpayer as taxpayer,

        c.street as street,
        c.number as number,
        c.complement as complement,
        c.neighborhood as neighborhood,
        c.city as city,
        c.uf as uf,
        c.cep as cep,
        c.city_code as cityCode
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE o.id = ?
    `
    )
    .get(orderId) as OrderRow | undefined;

  if (!order) throw new Error("Pedido não encontrado");

  const items = db
    .prepare(
      `
      SELECT
        oi.id as itemId,
        oi.product_id as productId,
        p.reference as productCode,
        p.description as description,
        p.unit as unit,
        oi.quantity as quantity,
        COALESCE(oi.unit_price, 0) as unitPrice
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
      ORDER BY p.description
    `
    )
    .all(orderId) as ItemRow[];

  const receivables = db
    .prepare(
      `
      SELECT
        id,
        amount,
        due_date as "dueDate",
        method
      FROM receivables
      WHERE order_id = ?
      ORDER BY due_date ASC, created_at ASC
    `
    )
    .all(orderId) as ReceivableRow[];

  return { order, items, receivables };
}

export async function buildFiscalDraftFromOrder(orderId: number, opts?: { fiscalOperationCode?: string }) {
  const { order, items, receivables } = loadOrder(orderId);
  if (!items.length) throw new Error("Pedido sem itens");

  const issuer = getIssuerConfig();
  const defaults = pickNfeDefaultsByAmbiente(getNfeDefaults(), getConfiguredFocusAmbiente());
  const pool = getFiscalDbPool();
  const productFiscalRepo = new ProductFiscalDataRepositoryPg(pool);
  const fiscalOperationRepo = new FiscalOperationRepositoryPg(pool);
  const requestedOperationCode = isPedidoFiscalOperationCode(opts?.fiscalOperationCode)
    ? opts?.fiscalOperationCode
    : defaults.defaultOperationCode;
  const fiscalOperation = await fiscalOperationRepo.getByCode(requestedOperationCode);
  if (!fiscalOperation) {
    throw new FiscalValidationError("Operação fiscal não encontrada", {
      orderId,
      fiscalOperationCode: requestedOperationCode,
    });
  }

  const recipientDoc = onlyDigits(order.customerCnpj);
  if (![11, 14].includes(recipientDoc.length)) {
    throw new FiscalValidationError("Cliente sem CPF/CNPJ válido para NF-e", {
      orderId,
      customerId: order.customerId,
    });
  }

  const recipientUf = (order.uf ?? "").trim();
  const issuerUf = issuer.endereco.uf.trim();

  const localDestino = recipientUf && recipientUf !== issuerUf ? 2 : 1;

  const nowIso = new Date().toISOString();
  const buildApproxTaxInfo = (totalAmount: number) => {
    const federalRate = 13.45;
    const estadualRate = 12;
    const federalValue = round2((totalAmount * federalRate) / 100);
    const estadualValue = round2((totalAmount * estadualRate) / 100);
    const customerCode = String(order.customerCode ?? "").replace(/[^\d]/g, "");
    const codePrefix = customerCode ? `${customerCode.padStart(8, "0")} ` : "";
    return `${codePrefix}${String(order.customerName).toUpperCase()}|Cod.Pedido(s): ${orderId}|Trib aprox. R$ Federal: ${federalValue.toFixed(2)} (${federalRate.toFixed(2)}%) Estadual: ${estadualValue.toFixed(2)} (${estadualRate.toFixed(2)}%) - Fonte:IBPT/empresometro.com.br 1C2537`;
  };
  const buildBillingOverrides = () => {
    if (order.paymentMethod !== "BOLETO" || receivables.length === 0) return {};

    const valorOriginal = round2(receivables.reduce((acc, receivable) => acc + Number(receivable.amount ?? 0), 0));
    const duplicatas = receivables.map((receivable, index) => ({
      numero: String(index + 1).padStart(3, "0"),
      data_vencimento: String(receivable.dueDate).slice(0, 10),
      valor: round2(Number(receivable.amount ?? 0)),
    }));

    return {
      numero_fatura: String(orderId),
      valor_original_fatura: valorOriginal,
      valor_desconto_fatura: 0,
      valor_liquido_fatura: valorOriginal,
      duplicatas,
    };
  };

  const draftItems = [];
  let totalAmount = 0;
  for (const it of items) {
    const fiscalData = await productFiscalRepo.getByProductId(it.productId);
    if (!fiscalData) {
      throw new FiscalValidationError("Produto sem cadastro fiscal no Postgres", { productId: it.productId });
    }
    draftItems.push({
      itemId: it.itemId ?? randomUUID(),
      productId: it.productId,
      productCode: it.productCode ?? it.productId,
      description: it.description,
      ncm: fiscalData.ncm,
      cfop: fiscalOperation.cfop,
      unidade: it.unit,
      quantidade: Number(it.quantity),
      valorUnitario: Number(it.unitPrice),
    });
    totalAmount += Number(it.quantity) * Number(it.unitPrice);
  }

  const missingAddress =
    !order.street || !order.number || !order.neighborhood || !order.city || !order.uf || !order.cep;
  if (missingAddress) {
    throw new FiscalValidationError(
      "Cliente sem endereço completo (precisa logradouro/número/bairro/cidade/UF/CEP)",
      { customerId: order.customerId, orderId }
    );
  }

  const draft = {
    model: 55 as const,
    serie: defaults.serie,

    issuer: {
      cnpj: issuer.cnpj,
      ie: issuer.ie,
      razaoSocial: issuer.razaoSocial,
      nomeFantasia: issuer.nomeFantasia ?? null,
      endereco: {
        logradouro: issuer.endereco.logradouro,
        numero: issuer.endereco.numero,
        bairro: issuer.endereco.bairro,
        municipio: issuer.endereco.municipio,
        uf: issuer.endereco.uf,
        cep: issuer.endereco.cep,
        codigoMunicipio: asIbgeCityCode(issuer.endereco.codigoMunicipio),
      },
    },

    recipient: {
      customerId: order.customerId,
      cpfCnpj: recipientDoc,
      ie: order.customerIe ? onlyDigits(order.customerIe) : null,
      nome: order.customerName,
      endereco: {
        logradouro: order.street,
        numero: order.number,
        bairro: order.neighborhood,
        municipio: order.city,
        uf: order.uf,
        cep: onlyDigits(order.cep),
        codigoMunicipio: asIbgeCityCode(order.cityCode),
      },
      contribuinteIcms: Boolean(order.taxpayer),
    },

    fiscalOperationCode: fiscalOperation.code,
    fiscalProfileCode: defaults.defaultProfileCode,
    naturezaOperacao: fiscalOperation.naturezaOperacao,

    dataEmissao: nowIso,
    dataEntradaSaida: nowIso,

    tipoDocumento: 1,
    localDestino,
    finalidadeEmissao: 1,
    consumidorFinal: 0,
    presencaComprador: 9,

    itens: draftItems,

    // Ajustes específicos por estado/cliente podem vir por aqui, sem mexer na engine
    focusPayloadOverrides: {
      indicador_pagamento: getPaymentIndicator(order.paymentMethod),
      formas_pagamento: [
        {
          forma_pagamento: getFocusPaymentCode(order.paymentMethod),
          valor_pagamento: totalAmount,
        },
      ],
      informacoes_adicionais_contribuinte: buildApproxTaxInfo(totalAmount),
      observacoes_contribuinte: [
        {
          campo: "NUM_PEDIDO",
          texto: String(orderId),
        },
      ],
      modalidade_frete: 0,
      ...buildBillingOverrides(),
    },
  };

  const serieNum = Number(draft.serie);
  if (Number.isFinite(serieNum) && serieNum >= 900) {
    throw new FiscalValidationError(
      `Série ${draft.serie} inválida para emissão normal: séries 900+ costumam ser reservadas para contingência e podem causar rejeição 244. Use uma série regular (por exemplo, 99 em homologação ou 1 em produção).`,
      { orderId, customerId: order.customerId }
    );
  }

  return { draft, orderId, customerId: order.customerId };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
