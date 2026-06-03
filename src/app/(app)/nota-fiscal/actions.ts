"use server";

import { revalidatePath } from "next/cache";

import { seedFiscalFromXmlDir } from "@/fiscal/usecases/seed_from_xml";

export async function seedFromXmlDirAction(formData: FormData) {
  const dir = String(formData.get("xmlDir") ?? "").trim();
  if (!dir) throw new Error("Informe a pasta dos XMLs.");
  await seedFiscalFromXmlDir(dir);
  revalidatePath("/nota-fiscal");
}
