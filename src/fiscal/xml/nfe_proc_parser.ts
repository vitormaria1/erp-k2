import { XMLParser } from "fast-xml-parser";

export type ParsedNfeProc = {
  ide: {
    natOp: string;
    mod: string;
    serie: string;
    nNF: string;
    dhEmi: string;
    dhSaiEnt?: string;
    tpNF: string;
    idDest: string;
    finNFe: string;
    indFinal: string;
    indPres: string;
  };
  emit: {
    CNPJ: string;
    xNome: string;
    xFant?: string;
    IE: string;
    enderEmit: {
      xLgr: string;
      nro: string;
      xBairro: string;
      cMun: string;
      xMun: string;
      UF: string;
      CEP: string;
    };
  };
  dest: {
    CNPJ?: string;
    CPF?: string;
    xNome: string;
    IE?: string;
    enderDest: {
      xLgr: string;
      nro: string;
      xBairro: string;
      cMun: string;
      xMun: string;
      UF: string;
      CEP: string;
    };
  };
  det: Array<{
    nItem: string;
    prod: {
      cProd: string;
      xProd: string;
      NCM: string;
      CFOP: string;
      uCom: string;
      qCom: string;
      vUnCom: string;
      vProd: string;
      uTrib: string;
      qTrib: string;
      vUnTrib: string;
    };
    imposto: {
      ICMS?: unknown;
      PIS?: unknown;
      COFINS?: unknown;
    };
  }>;
};

function asArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  // Keep values as strings (avoid losing leading zeros in CNPJ/CEP/cMun, etc.)
  parseTagValue: false,
  trimValues: true,
});

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function parseNfeProcXml(xml: string): ParsedNfeProc {
  const doc = parser.parse(xml) as unknown;
  const root = isRecord(doc) ? doc : {};
  const nfeProc = (root.nfeProc as unknown) ?? root;
  if (!isRecord(nfeProc)) throw new Error("XML inválido: nfeProc não encontrado");
  const nfe = nfeProc.NFe;
  if (!isRecord(nfe)) throw new Error("XML inválido: NFe não encontrado");
  const infNFe = nfe.infNFe;
  if (!isRecord(infNFe)) throw new Error("XML inválido: infNFe não encontrado");
  if (!infNFe) throw new Error("XML inválido: infNFe não encontrado");

  const ide = infNFe.ide;
  const emit = infNFe.emit;
  const dest = infNFe.dest;
  const det = asArray(infNFe.det as unknown);

  if (!ide || !emit || !dest || det.length === 0) throw new Error("XML inválido: campos obrigatórios ausentes");

  return { ide, emit, dest, det } as ParsedNfeProc;
}
