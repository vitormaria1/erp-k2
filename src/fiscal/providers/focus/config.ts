import { z } from "zod";
import type { Ambiente } from "../../domain/enums";

const EnvSchema = z.object({
  FOCUS_NFE_TOKEN: z.string().trim().min(10),
  FOCUS_NFE_ENV: z.union([z.literal("homologacao"), z.literal("producao")]).default("homologacao"),
  FOCUS_NFE_PROD_UNLOCK: z.string().trim().optional(),
});

export type FocusEnv = {
  token: string;
  ambiente: Ambiente;
  baseUrl: string;
};

export function getFocusEnv(): FocusEnv {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("Config Focus NFe inválida: defina FOCUS_NFE_TOKEN e FOCUS_NFE_ENV");
  }
  const ambiente = parsed.data.FOCUS_NFE_ENV as Ambiente;
  if (ambiente === "producao" && parsed.data.FOCUS_NFE_PROD_UNLOCK !== "YES") {
    throw new Error(
      "FOCUS_NFE_ENV=producao bloqueado. Para habilitar, defina FOCUS_NFE_PROD_UNLOCK=YES conscientemente."
    );
  }
  const baseUrl =
    ambiente === "homologacao" ? "https://homologacao.focusnfe.com.br" : "https://api.focusnfe.com.br";
  return { token: parsed.data.FOCUS_NFE_TOKEN, ambiente, baseUrl };
}
