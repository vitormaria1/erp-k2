"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { seedFiscalFromXmlDir } from "@/fiscal/usecases/seed_from_xml";
import { buildFiscalDraftFromXml } from "@/fiscal/usecases/build_draft_from_xml";
import { issueNfeHomologacaoSync } from "@/fiscal/usecases/issue_nfe_sync";
import { FiscalEngine, NoopTaxRuleEngine } from "@/fiscal/engine";
import { getFiscalDbPool } from "@/fiscal/infra/pg";
import {
  FiscalOperationRepositoryPg,
  FiscalProfileRepositoryPg,
  ProductFiscalDataRepositoryPg,
} from "@/fiscal/persistence/pg";
import { FocusNFeClient, FocusNFePayloadBuilder } from "@/fiscal/providers/focus";

function absFromRelOrAbs(p: string) {
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

export async function seedFromXmlDirAction(formData: FormData) {
  const dir = String(formData.get("xmlDir") ?? "").trim();
  if (!dir) throw new Error("Informe a pasta dos XMLs.");
  await seedFiscalFromXmlDir(dir);
  revalidatePath("/nota-fiscal");
}

export async function issueFromXmlFileAction(formData: FormData) {
  const file = String(formData.get("xmlFile") ?? "").trim();
  if (!file) throw new Error("Selecione um XML.");

  try {
    const xml = await readFile(absFromRelOrAbs(file), "utf-8");
    const { draft } = await buildFiscalDraftFromXml(xml);
    const issued = await issueNfeHomologacaoSync(draft);
    revalidatePath("/nota-fiscal");
    redirect(`/nota-fiscal?invoiceId=${issued.invoiceId}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    redirect(`/nota-fiscal?error=${encodeURIComponent(msg)}`);
  }
}

export async function previewDanfeFromXmlFileAction(formData: FormData) {
  const file = String(formData.get("xmlFile") ?? "").trim();
  if (!file) throw new Error("Selecione um XML.");

  const xml = await readFile(absFromRelOrAbs(file), "utf-8");
  const { draft } = await buildFiscalDraftFromXml(xml);

  const pool = getFiscalDbPool();
  const productFiscalDataRepo = new ProductFiscalDataRepositoryPg(pool);
  const fiscalProfileRepo = new FiscalProfileRepositoryPg(pool);
  const fiscalOperationRepo = new FiscalOperationRepositoryPg(pool);
  const payloadBuilder = new FocusNFePayloadBuilder({ productFiscalDataRepo });

  const engine = new FiscalEngine<Record<string, unknown>>({
    productFiscalDataRepo,
    fiscalProfileRepo,
    fiscalOperationRepo,
    taxRuleEngine: new NoopTaxRuleEngine(),
    payloadBuilder,
  });

  const validated = await engine.validateDraft(draft);
  const { payload } = await engine.buildFocusPayload(validated);

  const focus = new FocusNFeClient();
  const res = await focus.previsualizarDanfe({ payload });
  if (res.httpStatus < 200 || res.httpStatus >= 300) {
    throw new Error(`Falha ao gerar preview DANFE (HTTP ${res.httpStatus})`);
  }

  const outDir = path.join(process.cwd(), "public", "fiscal", "previews");
  await mkdir(outDir, { recursive: true });
  const name = `${randomUUID()}.pdf`;
  await writeFile(path.join(outDir, name), res.pdf);

  redirect(`/fiscal/previews/${name}`);
}
