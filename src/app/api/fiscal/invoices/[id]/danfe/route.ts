import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { withPgTx } from "@/fiscal/persistence/pg/tx";
import { getFiscalDbPool } from "@/fiscal/infra/pg";
import { FiscalInvoiceRepositoryPg } from "@/fiscal/persistence/pg";
import { FocusNFeClient } from "@/fiscal/providers/focus";
import { brandDanfePdf } from "@/fiscal/pdf/danfe-branding";

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

function brandedPdfPath(publicPath: string) {
  if (publicPath.endsWith("-brand.pdf")) return publicPath;
  return publicPath.replace(/\.pdf$/i, "-brand.pdf");
}

function sourcePdfPath(publicPath: string) {
  return publicPath.replace(/-brand\.pdf$/i, ".pdf");
}

async function ensureBrandedPdf(sourceAbsolutePath: string, sourcePublicPath: string) {
  const brandedAbsolutePath = path.join(
    process.cwd(),
    "public",
    brandedPdfPath(sourcePublicPath).replace(/^\/+/, "")
  );
  await brandDanfePdf(sourceAbsolutePath, brandedAbsolutePath);
  return {
    absolutePath: brandedAbsolutePath,
    publicPath: brandedPdfPath(sourcePublicPath),
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pool = getFiscalDbPool();
  const repo = new FiscalInvoiceRepositoryPg();
  const focus = new FocusNFeClient();

  const invoice = await withPgTx(pool, async (client) => repo.getById({ client, invoiceId: id }));
  if (!invoice) return new Response("Not found", { status: 404 });

  if (invoice.danfe_pdf_path) {
    const currentPublicPath = invoice.danfe_pdf_path;
    const currentLocalPath = path.join(process.cwd(), "public", currentPublicPath.replace(/^\/+/, ""));
    if (await fileExists(currentLocalPath)) {
      const sourcePublicCandidate = sourcePdfPath(currentPublicPath);
      const sourceLocalCandidate = path.join(process.cwd(), "public", sourcePublicCandidate.replace(/^\/+/, ""));
      const sourceAbsolutePath = (await fileExists(sourceLocalCandidate)) ? sourceLocalCandidate : currentLocalPath;
      const sourcePublicPath = (await fileExists(sourceLocalCandidate)) ? sourcePublicCandidate : currentPublicPath;
      const targetPublicPath = brandedPdfPath(sourcePublicPath);
      const targetLocalPath = path.join(process.cwd(), "public", targetPublicPath.replace(/^\/+/, ""));

      const branded = await ensureBrandedPdf(sourceAbsolutePath, sourcePublicPath);
      await withPgTx(pool, async (client) => {
        await repo.setDanfePdfPath({ client, invoiceId: invoice.id, publicPath: branded.publicPath });
      });
      const responsePath = (await fileExists(targetLocalPath)) ? targetLocalPath : branded.absolutePath;
      return pdfResponse(await readFile(responsePath), path.basename(responsePath));
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
  const sourceFilename = `${base}.pdf`;
  const sourceAbsolutePath = path.join(outDir, sourceFilename);
  await writeFile(sourceAbsolutePath, dl.body);
  const sourcePublicPath = `/fiscal/danfes/${sourceFilename}`;
  const branded = await ensureBrandedPdf(sourceAbsolutePath, sourcePublicPath);

  await withPgTx(pool, async (client) => {
    await repo.setDanfePdfPath({ client, invoiceId: invoice.id, publicPath: branded.publicPath });
  });

  return pdfResponse(await readFile(branded.absolutePath), path.basename(branded.absolutePath));
}
