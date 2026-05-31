import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { withPgTx } from "@/fiscal/persistence/pg/tx";
import { getFiscalDbPool } from "@/fiscal/infra/pg";
import { FiscalInvoiceRepositoryPg } from "@/fiscal/persistence/pg";
import { FocusNFeClient } from "@/fiscal/providers/focus";

function filenameSafe(v: string) {
  return v.replace(/[^A-Za-z0-9._-]+/g, "_");
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pool = getFiscalDbPool();
  const repo = new FiscalInvoiceRepositoryPg();
  const focus = new FocusNFeClient();

  const invoice = await withPgTx(pool, async (client) => repo.getById({ client, invoiceId: id }));
  if (!invoice) return new Response("Not found", { status: 404 });

  if (invoice.danfe_pdf_path) {
    return Response.redirect(new URL(invoice.danfe_pdf_path, req.url), 302);
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

  return Response.redirect(new URL(publicPath, req.url), 302);
}

