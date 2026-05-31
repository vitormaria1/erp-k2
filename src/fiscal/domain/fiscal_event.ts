import { z } from "zod";

export const FiscalEventTypeSchema = z.union([
  z.literal("CANCELAMENTO"),
  z.literal("INUTILIZACAO"),
  z.literal("CARTA_CORRECAO"),
  z.literal("REJEICAO"),
  z.literal("CONTINGENCIA"),
]);
export type FiscalEventType = z.infer<typeof FiscalEventTypeSchema>;

export const FiscalEventSchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  type: FiscalEventTypeSchema,
  createdAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()).default({}),
  version: z.number().int().positive(),
});

export type FiscalEvent = z.infer<typeof FiscalEventSchema>;

