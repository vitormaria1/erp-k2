import { z } from "zod";

export const FiscalProfileSchema = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(2).max(64),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  rules: z.record(z.string(), z.unknown()).default({}),
  active: z.boolean().default(true),
});

export type FiscalProfile = z.infer<typeof FiscalProfileSchema>;

