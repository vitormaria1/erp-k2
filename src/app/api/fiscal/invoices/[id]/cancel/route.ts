import { withPgTx } from "@/fiscal/persistence/pg/tx";
import { getFiscalDbPool } from "@/fiscal/infra/pg";
import { FiscalInvoiceRepositoryPg, FiscalJobRepositoryPg } from "@/fiscal/persistence/pg";
import { redirectToPublicUrl } from "@/app/api/_utils/public-origin";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const form = await req.formData();
  const justificativa = String(form.get("justificativa") ?? "").trim();
  if (justificativa.length < 15 || justificativa.length > 255) {
    return new Response("Justificativa deve ter 15 a 255 caracteres", { status: 400 });
  }

  const pool = getFiscalDbPool();
  const invoiceRepo = new FiscalInvoiceRepositoryPg();
  const jobRepo = new FiscalJobRepositoryPg();

  await withPgTx(pool, async (client) => {
    const invoice = await invoiceRepo.getById({ client, invoiceId: id });
    if (!invoice) throw new Error("NF não encontrada");
    if (!invoice.focus_ref) throw new Error("NF sem referência Focus");
    if (invoice.internal_status !== "AUTHORIZED" && invoice.internal_status !== "ISSUING") {
      throw new Error(`Status inválido para cancelamento: ${invoice.internal_status}`);
    }

    await invoiceRepo.setInternalStatus({ client, invoiceId: id, status: "CANCELING" });
    await jobRepo.enqueue({
      client,
      kind: "CANCEL_NFE",
      payload: { invoiceId: id, focusRef: invoice.focus_ref, justificativa },
      invoiceId: id,
    });
  });

  return redirectToPublicUrl(req, `/nota-fiscal?invoiceId=${encodeURIComponent(id)}`, 303);
}
