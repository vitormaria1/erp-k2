import { z } from "zod";
import { FocusNFeStatus, InvoiceInternalStatus, NFeModel } from "./enums";

export const InvoiceSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),

  model: z.custom<NFeModel>(),
  serie: z.string().trim().min(1).max(3),
  numero: z.string().trim().min(1).max(9).nullable().optional(),

  issuerCnpj: z.string().trim().regex(/^\d{14}$/),
  customerId: z.string().uuid(),

  internalStatus: z.custom<InvoiceInternalStatus>(),

  focusRef: z.string().trim().min(6).max(120).nullable().optional(),
  focusStatus: z.custom<FocusNFeStatus>().nullable().optional(),

  sefazStatus: z.string().trim().nullable().optional(),
  sefazMessage: z.string().trim().nullable().optional(),
  chaveAcesso: z.string().trim().length(44).nullable().optional(),
  protocoloAutorizacao: z.string().trim().nullable().optional(),

  xmlAuthorized: z.string().nullable().optional(),

  danfePdfPath: z.string().nullable().optional(),
});

export type Invoice = z.infer<typeof InvoiceSchema>;
