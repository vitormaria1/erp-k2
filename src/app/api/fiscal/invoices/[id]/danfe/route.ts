import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { withPgTx } from "@/fiscal/persistence/pg/tx";
import { getFiscalDbPool } from "@/fiscal/infra/pg";
import { FiscalInvoiceRepositoryPg } from "@/fiscal/persistence/pg";
import { FocusNFeClient } from "@/fiscal/providers/focus";

function filenameSafe(v: string) {
  return v.replace(/[^A-Za-z0-9._-]+/g, "_");
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function pdfResponse(pdf: Buffer, filename: string) {
  const body = new Uint8Array(pdf);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pool = getFiscalDbPool();
  const repo = new FiscalInvoiceRepositoryPg();
  const focus = new FocusNFeClient();

  const invoice = await withPgTx(pool, async (client) => repo.getById({ client, invoiceId: id }));
  if (!invoice) return new Response("Not found", { status: 404 });

  if (invoice.danfe_pdf_path) {
    const localPath = path.join(process.cwd(), "public", invoice.danfe_pdf_path.replace(/^\/+/, ""));
    if (await fileExists(localPath)) {
      const filename = path.basename(localPath);
      return pdfResponse(await readFile(localPath), filename);
    }
  }

  if (!invoice.focus_ref) return new Response("Invoice has no focus_ref", { status: 400 });

  const consult = await focus.consultarNfe({ ref: invoice.focus_ref, completa: 1 });
  const caminho = typeof consult.body.caminho_danfe === "string" ? consult.body.caminho_danfe : null;
  if (!caminho) return new Response("DANFE path not available from Focus yet", { status: 409 });

  const dl = await focus.baixarArquivoBin(caminho, "application/pdf");
  if (dl.httpStatus < 200 || dl.httpStatus >= 300) {
    return new Response(`Falha ao baixar DANFE da Focus (HTTP ${dl.httpStatus})`, { status: 502 });
  }

  const outDir = path.join(process.cwd(), "public", "fiscal", "danfes");
  await mkdir(outDir, { recursive: true });
  const base = filenameSafe(invoice.chave_acesso ?? invoice.focus_ref ?? invoice.id);
  const filename = `${base}.pdf`;
  await writeFile(path.join(outDir, filename), dl.body);
  const publicPath = `/fiscal/danfes/${filename}`;

  await withPgTx(pool, async (client) => {
    await repo.setDanfePdfPath({ client, invoiceId: invoice.id, publicPath });
  });

  return pdfResponse(dl.body, filename);
}
