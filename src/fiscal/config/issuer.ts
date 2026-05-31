import { z } from "zod";

export type IssuerConfig = {
  cnpj: string;
  ie: string;
  razaoSocial: string;
  nomeFantasia?: string;
  endereco: {
    logradouro: string;
    numero: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
    codigoMunicipio?: string;
  };
};

const EnvSchema = z.object({
  FISCAL_ISSUER_CNPJ: z.string().trim().regex(/^\d{14}$/),
  FISCAL_ISSUER_IE: z.string().trim().min(2),
  FISCAL_ISSUER_RAZAO: z.string().trim().min(2),
  FISCAL_ISSUER_FANTASIA: z.string().trim().optional(),

  FISCAL_ISSUER_LOGRADOURO: z.string().trim().min(2),
  FISCAL_ISSUER_NUMERO: z.string().trim().min(1),
  FISCAL_ISSUER_BAIRRO: z.string().trim().min(1),
  FISCAL_ISSUER_MUNICIPIO: z.string().trim().min(1),
  FISCAL_ISSUER_UF: z.string().trim().length(2),
  FISCAL_ISSUER_CEP: z.string().trim().regex(/^\d{8}$/),
  FISCAL_ISSUER_COD_MUN: z.string().trim().regex(/^\d{7}$/).optional(),
});

export function getIssuerConfig(): IssuerConfig {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("Config do emitente inválida: defina FISCAL_ISSUER_* no .env");
  }

  return {
    cnpj: parsed.data.FISCAL_ISSUER_CNPJ,
    ie: parsed.data.FISCAL_ISSUER_IE,
    razaoSocial: parsed.data.FISCAL_ISSUER_RAZAO,
    nomeFantasia: parsed.data.FISCAL_ISSUER_FANTASIA,
    endereco: {
      logradouro: parsed.data.FISCAL_ISSUER_LOGRADOURO,
      numero: parsed.data.FISCAL_ISSUER_NUMERO,
      bairro: parsed.data.FISCAL_ISSUER_BAIRRO,
      municipio: parsed.data.FISCAL_ISSUER_MUNICIPIO,
      uf: parsed.data.FISCAL_ISSUER_UF,
      cep: parsed.data.FISCAL_ISSUER_CEP,
      codigoMunicipio: parsed.data.FISCAL_ISSUER_COD_MUN,
    },
  };
}

