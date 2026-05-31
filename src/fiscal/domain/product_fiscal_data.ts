import { z } from "zod";

export const NcmSchema = z
  .string()
  .trim()
  .regex(/^\d{8}$/, "NCM deve ter 8 dígitos");
export type NCM = z.infer<typeof NcmSchema>;

export const CestSchema = z
  .string()
  .trim()
  .regex(/^\d{7}$/, "CEST deve ter 7 dígitos")
  .nullable()
  .optional();
export type CEST = z.infer<typeof CestSchema>;

export const OrigemSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
]);
export type Origem = z.infer<typeof OrigemSchema>;

export const CstIcmsSchema = z.string().trim().min(2).max(3);
export type CstIcms = z.infer<typeof CstIcmsSchema>;

export const CstPisSchema = z.string().trim().min(2).max(2);
export type CstPis = z.infer<typeof CstPisSchema>;

export const CstCofinsSchema = z.string().trim().min(2).max(2);
export type CstCofins = z.infer<typeof CstCofinsSchema>;

export const PercentSchema = z.number().min(0).max(100);
export type Percent = z.infer<typeof PercentSchema>;

export const ProductFiscalDataSchema = z.object({
  productId: z.string().uuid(),

  ncm: NcmSchema,
  cest: CestSchema,
  origem: OrigemSchema,

  unidadeTributavel: z.string().trim().min(1).max(6),

  cstIcms: CstIcmsSchema,
  cstPis: CstPisSchema,
  cstCofins: CstCofinsSchema,

  aliquotaIcms: PercentSchema.optional(),
  aliquotaPis: PercentSchema.optional(),
  aliquotaCofins: PercentSchema.optional(),

  cfopPadrao: z.string().trim().min(4).max(4),

  beneficiosFiscais: z.array(z.string().trim().min(1)).default([]),

  tributacaoInterna: z.record(z.string(), z.unknown()).default({}),
  tributacaoInterestadual: z.record(z.string(), z.unknown()).default({}),
});

export type ProductFiscalData = z.infer<typeof ProductFiscalDataSchema>;
