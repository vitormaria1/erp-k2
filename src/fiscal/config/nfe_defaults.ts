import { z } from "zod";

const EnvSchema = z.object({
  // Em homologação, use uma série "normal" (ex: 1 ou 99). Séries 900+ costumam ser reservadas para contingência e podem gerar rejeição 244.
  FISCAL_NFE_SERIE_HOMOLOG: z.string().trim().min(1).max(3).default("99"),
  // Para evitar colisão com testes antigos em homologação, podemos iniciar a numeração em um patamar alto.
  FISCAL_NFE_START_NUMBER_HOMOLOG: z
    .string()
    .trim()
    .regex(/^\d+$/)
    .transform((v) => Number(v))
    .pipe(z.number().int().positive())
    .default(1000),
  FISCAL_DEFAULT_OPERATION_CODE: z.string().trim().min(2).default("VENDA_INTERNA"),
  FISCAL_DEFAULT_PROFILE_CODE: z.string().trim().min(2).default("PRODUCAO_PROPRIA"),
});

export function getNfeDefaults() {
  const parsed = EnvSchema.parse(process.env);
  return {
    serieHomolog: parsed.FISCAL_NFE_SERIE_HOMOLOG,
    startNumberHomolog: parsed.FISCAL_NFE_START_NUMBER_HOMOLOG,
    defaultOperationCode: parsed.FISCAL_DEFAULT_OPERATION_CODE,
    defaultProfileCode: parsed.FISCAL_DEFAULT_PROFILE_CODE,
  };
}
