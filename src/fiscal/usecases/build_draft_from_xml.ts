import { randomUUID } from "node:crypto";

import { getDb } from "../../lib/db";
import { parseNfeProcXml } from "../xml/nfe_proc_parser";

function onlyDigits(v: unknown) {
  return String(v ?? "").replace(/[^\d]/g, "");
}

export async function buildFiscalDraftFromXml(xml: string) {
  const parsed = parseNfeProcXml(xml);
  const sqlite = getDb();

  const destCnpj = onlyDigits(String(parsed.dest.CNPJ ?? parsed.dest.CPF ?? ""));
  const customerRow = sqlite
    .prepare("SELECT id FROM customers WHERE cnpj = ?")
    .get(destCnpj) as { id: string } | undefined;

  const customerId = customerRow?.id ?? randomUUID();

  const fiscalOperationCode = (() => {
    const nat = String(parsed.ide.natOp ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);
    return `${nat}_${String(parsed.det[0]!.prod.CFOP).trim()}_${String(parsed.ide.idDest).trim()}`;
  })();

  const fiscalProfileCode = "PRODUCAO_PROPRIA";

  const itens = parsed.det.map((d) => {
    const reference = String(d.prod.cProd).trim();
    const product = sqlite
      .prepare("SELECT id, description, unit FROM products WHERE reference = ?")
      .get(reference) as { id: string; description: string; unit: string } | undefined;

    const productId = product?.id ?? randomUUID();
    const description = product?.description ?? String(d.prod.xProd ?? reference);
    const unidade = String(d.prod.uCom ?? d.prod.uTrib ?? product?.unit ?? "UN").trim();
    const quantidade = Number(d.prod.qCom);
    const valorUnitario = Number(d.prod.vUnCom);

    return {
      itemId: randomUUID(),
      productId,
      description,
      ncm: onlyDigits(String(d.prod.NCM)),
      cfop: String(d.prod.CFOP).trim(),
      unidade,
      quantidade,
      valorUnitario,
    };
  });

  const draft = {
    model: 55 as const,
    serie: String(parsed.ide.serie ?? "1"),

    issuer: {
      cnpj: onlyDigits(parsed.emit.CNPJ),
      ie: onlyDigits(parsed.emit.IE),
      razaoSocial: String(parsed.emit.xNome),
      nomeFantasia: parsed.emit.xFant ? String(parsed.emit.xFant) : null,
      endereco: {
        logradouro: String(parsed.emit.enderEmit.xLgr),
        numero: String(parsed.emit.enderEmit.nro),
        bairro: String(parsed.emit.enderEmit.xBairro),
        municipio: String(parsed.emit.enderEmit.xMun),
        uf: String(parsed.emit.enderEmit.UF),
        cep: onlyDigits(String(parsed.emit.enderEmit.CEP)),
        codigoMunicipio: onlyDigits(String(parsed.emit.enderEmit.cMun)),
      },
    },

    recipient: {
      customerId,
      cpfCnpj: destCnpj,
      ie: parsed.dest.IE ? onlyDigits(String(parsed.dest.IE)) : null,
      nome: String(parsed.dest.xNome),
      endereco: {
        logradouro: String(parsed.dest.enderDest.xLgr),
        numero: String(parsed.dest.enderDest.nro),
        bairro: String(parsed.dest.enderDest.xBairro),
        municipio: String(parsed.dest.enderDest.xMun),
        uf: String(parsed.dest.enderDest.UF),
        cep: onlyDigits(String(parsed.dest.enderDest.CEP)),
        codigoMunicipio: onlyDigits(String(parsed.dest.enderDest.cMun)),
      },
      contribuinteIcms: Boolean(parsed.dest.IE),
    },

    fiscalOperationCode,
    fiscalProfileCode,
    naturezaOperacao: String(parsed.ide.natOp),

    dataEmissao: String(parsed.ide.dhEmi),
    dataEntradaSaida: parsed.ide.dhSaiEnt ? String(parsed.ide.dhSaiEnt) : null,

    tipoDocumento: Number(parsed.ide.tpNF),
    localDestino: Number(parsed.ide.idDest),
    finalidadeEmissao: Number(parsed.ide.finNFe),
    consumidorFinal: Number(parsed.ide.indFinal),
    presencaComprador: Number(parsed.ide.indPres),

    itens,
  };

  return { draft, parsed };
}
