import { randomUUID } from "node:crypto";

import { getDb } from "../../lib/db";
import { getIssuerConfig } from "../config/issuer";
import { getNfeDefaults } from "../config/nfe_defaults";
import { getFiscalDbPool } from "../infra/pg";
import { ProductFiscalDataRepositoryPg } from "../persistence/pg";
import { FiscalValidationError } from "../engine/errors";

function onlyDigits(v: string | null | undefined) {
  return String(v ?? "").replace(/[^\d]/g, "");
}

type OrderRow = {
  id: number;
  createdAt: string;
  customerId: string;

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

type ItemRow = {
  itemId: string;
  productId: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
};

function loadOrder(orderId: number): { order: OrderRow; items: ItemRow[] } {
  const db = getDb();

  const order = db
    .prepare(
      `
      SELECT
        o.id as id,
        o.created_at as createdAt,
        o.customer_id as customerId,

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

  return { order, items };
}

export async function buildFiscalDraftFromOrder(orderId: number) {
  const { order, items } = loadOrder(orderId);
  if (!items.length) throw new Error("Pedido sem itens");

  const issuer = getIssuerConfig();
  const defaults = getNfeDefaults();
  const pool = getFiscalDbPool();
  const productFiscalRepo = new ProductFiscalDataRepositoryPg(pool);

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

  const draftItems = [];
  for (const it of items) {
    const fiscalData = await productFiscalRepo.getByProductId(it.productId);
    if (!fiscalData) {
      throw new FiscalValidationError("Produto sem cadastro fiscal no Postgres", { productId: it.productId });
    }
    draftItems.push({
      itemId: it.itemId ?? randomUUID(),
      productId: it.productId,
      description: it.description,
      ncm: fiscalData.ncm,
      cfop: fiscalData.cfopPadrao,
      unidade: it.unit,
      quantidade: Number(it.quantity),
      valorUnitario: Number(it.unitPrice),
    });
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
    serie: defaults.serieHomolog,

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
        codigoMunicipio: issuer.endereco.codigoMunicipio ?? null,
      },
    },

    recipient: {
      customerId: order.customerId,
      cpfCnpj: recipientDoc,
      ie: order.customerIe ? onlyDigits(order.customerIe) : null,
      nome: order.customerTradeName ? order.customerTradeName : order.customerName,
      endereco: {
        logradouro: order.street,
        numero: order.number,
        bairro: order.neighborhood,
        municipio: order.city,
        uf: order.uf,
        cep: onlyDigits(order.cep),
        codigoMunicipio: order.cityCode ? onlyDigits(order.cityCode) : null,
      },
      contribuinteIcms: Boolean(order.taxpayer),
    },

    fiscalOperationCode: defaults.defaultOperationCode,
    fiscalProfileCode: defaults.defaultProfileCode,
    naturezaOperacao: "VENDA - PROD. INDU",

    dataEmissao: nowIso,
    dataEntradaSaida: nowIso,

    tipoDocumento: 1,
    localDestino,
    finalidadeEmissao: 1,
    consumidorFinal: 0,
    presencaComprador: 9,

    itens: draftItems,

    // Ajustes específicos por estado/cliente podem vir por aqui, sem mexer na engine
    focusPayloadOverrides: {},
  };

  const serieNum = Number(draft.serie);
  if (Number.isFinite(serieNum) && serieNum >= 900) {
    throw new FiscalValidationError(
      `Série ${draft.serie} inválida para emissão normal: séries 900+ costumam ser reservadas para contingência e podem causar rejeição 244. Use série 1 em homologação.`,
      { orderId, customerId: order.customerId }
    );
  }

  return { draft, orderId, customerId: order.customerId };
}
