import { z } from "zod";
import {
  ConsumidorFinal,
  FinalidadeEmissao,
  LocalDestino,
  PresencaComprador,
  TipoDocumento,
} from "../domain/enums";

export const IssuerSchema = z.object({
  cnpj: z.string().trim().regex(/^\d{14}$/),
  ie: z.string().trim().min(2).max(20),
  razaoSocial: z.string().trim().min(2).max(120),
  nomeFantasia: z.string().trim().max(120).nullable().optional(),
  endereco: z.object({
    logradouro: z.string().trim().min(2).max(120),
    numero: z.string().trim().min(1).max(20),
    bairro: z.string().trim().min(1).max(60),
    municipio: z.string().trim().min(1).max(60),
    uf: z.string().trim().length(2),
    cep: z.string().trim().regex(/^\d{8}$/),
    codigoMunicipio: z.string().trim().regex(/^\d{7}$/).nullable().optional(),
  }),
});
export type Issuer = z.infer<typeof IssuerSchema>;

export const RecipientSchema = z.object({
  customerId: z.string().uuid(),
  cpfCnpj: z.string().trim().min(11).max(14),
  ie: z.string().trim().max(20).nullable().optional(),
  nome: z.string().trim().min(2).max(120),
  endereco: z.object({
    logradouro: z.string().trim().min(2).max(120),
    numero: z.string().trim().min(1).max(20),
    bairro: z.string().trim().min(1).max(60),
    municipio: z.string().trim().min(1).max(60),
    uf: z.string().trim().length(2),
    cep: z.string().trim().regex(/^\d{8}$/),
    codigoMunicipio: z.string().trim().regex(/^\d{7}$/).nullable().optional(),
  }),
  contribuinteIcms: z.boolean().default(false),
});
export type Recipient = z.infer<typeof RecipientSchema>;

export const InvoiceItemDraftSchema = z.object({
  itemId: z.string().uuid(),
  productId: z.string().uuid(),
  productCode: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().min(1).max(120),
  ncm: z.string().trim().regex(/^\d{8}$/),
  cfop: z.string().trim().regex(/^\d{4}$/),
  unidade: z.string().trim().min(1).max(6),
  quantidade: z.number().positive(),
  valorUnitario: z.number().nonnegative(),
  desconto: z.number().nonnegative().optional(),
});
export type InvoiceItemDraft = z.infer<typeof InvoiceItemDraftSchema>;

export const FiscalInvoiceDraftSchema = z.object({
  model: z.literal(55).default(55),
  serie: z.string().trim().min(1).max(3).default("1"),
  numero: z.number().int().positive().optional(),

  issuer: IssuerSchema,
  recipient: RecipientSchema,

  fiscalOperationCode: z.string().trim().min(2).max(64),
  fiscalProfileCode: z.string().trim().min(2).max(64),

  naturezaOperacao: z.string().trim().min(2).max(120),

  // Aceita ISO com offset (-03:00) vindo de XMLs reais.
  dataEmissao: z.string().trim().min(10),
  dataEntradaSaida: z.string().trim().min(10).nullable().optional(),

  tipoDocumento: z.custom<TipoDocumento>(),
  localDestino: z.custom<LocalDestino>(),
  finalidadeEmissao: z.custom<FinalidadeEmissao>(),
  consumidorFinal: z.custom<ConsumidorFinal>(),
  presencaComprador: z.custom<PresencaComprador>(),

  itens: z.array(InvoiceItemDraftSchema).min(1),

  focusPayloadOverrides: z.record(z.string(), z.unknown()).optional(),
});
export type FiscalInvoiceDraft = z.infer<typeof FiscalInvoiceDraftSchema>;

export type TaxLine = {
  kind: "ICMS" | "PIS" | "COFINS";
  cst: string;
  base: number;
  rate: number;
  amount: number;
  meta?: Record<string, unknown>;
};

export type TaxCalculationResult = {
  itemId: string;
  taxes: TaxLine[];
};
