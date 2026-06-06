import { issueNfeForOrder } from "@/fiscal/usecases/nfe_from_order";
import { OrderAlreadyHasInvoiceError } from "@/fiscal/usecases/order_invoice_guard";
import { getConfiguredFocusAmbiente } from "@/fiscal/providers/focus";
import { processFiscalJobsOnce } from "@/fiscal/worker/processor";
import { FiscalValidationError } from "@/fiscal/engine/errors";

async function runInlineFiscalWorker() {
  if (process.env.FISCAL_INLINE_WORKER === "0") return;

  const timeoutMs = 12_000;
  await Promise.race([
    processFiscalJobsOnce(2),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

function wantsJson(req: Request) {
  return (req.headers.get("accept") ?? "").includes("application/json");
}

function formatIssueError(error: unknown, ambiente: string) {
  if (error instanceof OrderAlreadyHasInvoiceError) {
    return `Este pedido já possui NF vinculada (${error.invoiceSerie}/${error.invoiceNumber ?? "-"}, status ${error.invoiceStatus}).`;
  }
  if (error instanceof FiscalValidationError) {
    return `Não foi possível emitir a NF-e (${ambiente}). Corrija o cadastro e tente novamente: ${error.message}`;
  }
  const msg = error instanceof Error ? error.message : String(error);
  if (/Config Focus NFe inválida|FOCUS_NFE_/i.test(msg)) {
    return `Não foi possível emitir a NF-e (${ambiente}). A integração com a Focus não está configurada corretamente no ambiente.`;
  }
  if (/DATABASE_URL ausente|Supabase|Postgres/i.test(msg)) {
    return `Não foi possível emitir a NF-e (${ambiente}). O banco fiscal não está acessível no momento.`;
  }
  return `Falha ao emitir NF-e (${ambiente}): ${msg}`;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const orderId = Number(form.get("orderId"));
    if (!Number.isFinite(orderId)) {
      return new Response("orderId inválido", { status: 400 });
    }

    const issued = await issueNfeForOrder(orderId);

    // Process inline when enabled so the UI reflects the real status even without a dedicated worker.
    await runInlineFiscalWorker().catch((e) => console.error("inline fiscal worker failed", e));

    const redirectTo = `/nota-fiscal?invoiceId=${encodeURIComponent(issued.invoiceId)}`;
    if (wantsJson(req)) {
      return Response.json({ ...issued, redirectTo }, { status: 200 });
    }
    return Response.redirect(new URL(redirectTo, req.url), 303);
  } catch (e) {
    if (e instanceof OrderAlreadyHasInvoiceError) {
      const redirectTo = `/nota-fiscal?invoiceId=${encodeURIComponent(e.invoiceId)}`;
      const error = formatIssueError(e, getConfiguredFocusAmbiente());
      if (wantsJson(req)) {
        return Response.json({ error, redirectTo, invoiceId: e.invoiceId, duplicate: true }, { status: 409 });
      }
      return Response.redirect(new URL(`${redirectTo}&error=${encodeURIComponent(error)}`, req.url), 303);
    }
    const ambiente = getConfiguredFocusAmbiente();
    const msg = formatIssueError(e, ambiente);
    if (wantsJson(req)) {
      return Response.json({ error: msg }, { status: 500 });
    }
    return new Response(msg, { status: 500 });
  }
}
