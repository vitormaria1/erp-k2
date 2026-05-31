import { z } from "zod";
import { FinalidadeEmissao, LocalDestino, TipoDocumento } from "./enums";

export const FiscalOperationSchema = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(2).max(64),
  naturezaOperacao: z.string().trim().min(2).max(120),
  cfop: z.string().trim().regex(/^\d{4}$/, "CFOP deve ter 4 dígitos"),

  tipoDocumento: z.custom<TipoDocumento>(),
  finalidadeEmissao: z.custom<FinalidadeEmissao>(),
  localDestino: z.custom<LocalDestino>(),

  consumidorFinal: z.boolean(),
  devolucao: z.boolean().default(false),
  bonificacao: z.boolean().default(false),
});

export type FiscalOperation = z.infer<typeof FiscalOperationSchema>;
