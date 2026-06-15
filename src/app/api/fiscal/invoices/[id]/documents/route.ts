import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { withPgTx } from "@/fiscal/persistence/pg/tx";
import { getFiscalDbPool } from "@/fiscal/infra/pg";
import { FiscalInvoiceRepositoryPg } from "@/fiscal/persistence/pg";
import { getPublicOrigin } from "@/app/api/_utils/public-origin";
import { generateBoletoForReceivable } from "@/lib/boleto-issuance";
import { getBoletoPdfBuffer } from "@/lib/boleto-pdf";
import { getDb } from "@/lib/db";
import { isAuthenticated } from "@/lib/simple-auth";

const execFileAsync = promisify(execFile);
const BOLETO_READY_ATTEMPTS = 20;
const BOLETO_READY_DELAY_MS = 1500;

function pdfResponse(pdf: Buffer, filename: string) {
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}

async function fetchPdf(url: string, cookieHeader: string | null) {
  const res = await fetch(url, {
    method: "GET",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Falha ao carregar PDF auxiliar (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableBoletoError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /Linha digitavel indisponivel/i.test(message) ||
    /Falha ao baixar PDF do boleto no Sicredi/i.test(message) ||
    /Falha ao carregar PDF auxiliar \(409\)/i.test(message) ||
    /Falha ao carregar PDF auxiliar \(5\d\d\)/i.test(message)
  );
}

async function mergePdfs(buffers: Buffer[]) {
  if (buffers.length === 0) {
    throw new Error("Nenhum PDF para juntar");
  }
  if (buffers.length === 1) {
    return buffers[0];
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "erp-k2-docs-"));
  try {
    const inputPaths: string[] = [];
    for (const [index, buffer] of buffers.entries()) {
      const filePath = path.join(workDir, `${String(index + 1).padStart(2, "0")}.pdf`);
      await writeFile(filePath, buffer);
      inputPaths.push(filePath);
    }
    const outputPath = path.join(workDir, "combined.pdf");
    await execFileAsync("pdfunite", [...inputPaths, outputPath]);
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => null);
  }
}

async function loadBoletoPdfs(args: {
  receivableIds: string[];
}) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < BOLETO_READY_ATTEMPTS; attempt++) {
    try {
      return await Promise.all(
        args.receivableIds.map((receivableId) => getBoletoPdfBuffer(receivableId))
      );
    } catch (error) {
      lastError = error;
      if (!isRetryableBoletoError(error) || attempt === BOLETO_READY_ATTEMPTS - 1) {
        throw error;
      }
      await sleep(BOLETO_READY_DELAY_MS);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Falha ao carregar boletos"));
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await ctx.params;
  const pool = getFiscalDbPool();
  const repo = new FiscalInvoiceRepositoryPg();
  const invoice = await withPgTx(pool, async (client) => repo.getById({ client, invoiceId: id }));

  if (!invoice) return new Response("Not found", { status: 404 });
  if (invoice.internal_status !== "AUTHORIZED") {
    return new Response("NF ainda não autorizada", { status: 409 });
  }

  const origin = getPublicOrigin(req);
  const cookieHeader = req.headers.get("cookie");
  const danfeBuffer = await fetchPdf(`${origin}/api/fiscal/invoices/${encodeURIComponent(id)}/danfe`, cookieHeader);

  if (!invoice.source_order_id) {
    return pdfResponse(danfeBuffer, `documentos-${id}.pdf`);
  }

  const db = getDb();
  const order = db
    .prepare(
      `
      SELECT payment_method as "paymentMethod"
      FROM orders
      WHERE id = ?
    `
    )
    .get(invoice.source_order_id) as { paymentMethod: string | null } | undefined;

  if (!order || order.paymentMethod !== "BOLETO") {
    return pdfResponse(danfeBuffer, `documentos-${id}.pdf`);
  }

  const receivables = db
    .prepare(
      `
      SELECT id
      FROM receivables
      WHERE order_id = ?
        AND method = 'BOLETO'
      ORDER BY due_date ASC, created_at ASC
    `
    )
    .all(invoice.source_order_id) as Array<{ id: string }>;

  if (receivables.length === 0) {
    return pdfResponse(danfeBuffer, `documentos-${id}.pdf`);
  }

  for (const receivable of receivables) {
    await generateBoletoForReceivable(receivable.id);
  }

  const boletoBuffers = await loadBoletoPdfs({
    receivableIds: receivables.map((receivable) => receivable.id),
  });

  const merged = await mergePdfs([danfeBuffer, ...boletoBuffers]);
  return pdfResponse(merged, `documentos-${id}.pdf`);
}
