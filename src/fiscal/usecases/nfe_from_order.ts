import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { FiscalEngine, NoopTaxRuleEngine } from "../engine";
import { getFiscalDbPool } from "../infra/pg";
import {
  FiscalOperationRepositoryPg,
  FiscalProfileRepositoryPg,
  ProductFiscalDataRepositoryPg,
} from "../persistence/pg";
import { FocusNFeClient, FocusNFePayloadBuilder } from "../providers/focus";
import { issueNfeHomologacao } from "./issue_nfe";
import { buildFiscalDraftFromOrder } from "./build_draft_from_order";

export async function previewDanfeForOrder(orderId: number): Promise<{ publicPath: string }> {
  const { draft } = await buildFiscalDraftFromOrder(orderId);
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
  return { publicPath: `/fiscal/previews/${name}` };
}

export async function issueNfeForOrderHomologacao(orderId: number) {
  const { draft } = await buildFiscalDraftFromOrder(orderId);
  return issueNfeHomologacao(draft);
}
