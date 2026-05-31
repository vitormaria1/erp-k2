import { withPgTx } from "@/fiscal/persistence/pg/tx";
import { getFiscalDbPool } from "@/fiscal/infra/pg";
import { FiscalInvoiceRepositoryPg } from "@/fiscal/persistence/pg";
import { FocusNFeClient } from "@/fiscal/providers/focus";

function filenameSafe(v: string) {
  return v.replace(/[^A-Za-z0-9._-]+/g, "_");
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pool = getFiscalDbPool();
  const repo = new FiscalInvoiceRepositoryPg();
  const focus = new FocusNFeClient();

  const invoice = await withPgTx(pool, async (client) => repo.getById({ client, invoiceId: id }));
  if (!invoice) return new Response("Not found", { status: 404 });

  if (invoice.xml_authorized) {
    const name = filenameSafe(invoice.chave_acesso ?? invoice.focus_ref ?? invoice.id);
    return new Response(invoice.xml_authorized, {
      status: 200,
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "content-disposition": `attachment; filename=\"${name}.xml\"`,
      },
    });
  }

  if (!invoice.focus_ref) return new Response("Invoice has no focus_ref", { status: 400 });

  const consult = await focus.consultarNfe({ ref: invoice.focus_ref, completa: 1 });
  const caminho = typeof consult.body.caminho_xml_nota_fiscal === "string" ? consult.body.caminho_xml_nota_fiscal : null;
  if (!caminho) return new Response("XML path not available from Focus yet", { status: 409 });

  const dl = await focus.baixarArquivo(caminho);
  if (dl.httpStatus < 200 || dl.httpStatus >= 300) {
    return new Response(`Falha ao baixar XML da Focus (HTTP ${dl.httpStatus})`, { status: 502 });
  }

  await withPgTx(pool, async (client) => {
    await repo.applyFocusResult({ client, invoiceId: invoice.id, xmlAuthorized: dl.body });
  });

  const name = filenameSafe(invoice.chave_acesso ?? invoice.focus_ref ?? invoice.id);
  return new Response(dl.body, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename=\"${name}.xml\"`,
    },
  });
}

