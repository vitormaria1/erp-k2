import { FiscalValidationError } from "@/fiscal/engine/errors";
import { issueNfeForOrder } from "@/fiscal/usecases/nfe_from_order";
import { OrderAlreadyHasInvoiceError } from "@/fiscal/usecases/order_invoice_guard";
import { getConfiguredFocusAmbiente } from "@/fiscal/providers/focus";
import { processFiscalJobsOnce } from "@/fiscal/worker/processor";
import { createOrder, parseCreateOrderFormData } from "@/app/(app)/pedidos/novo/create-order";
import { isPedidoFiscalOperationCode } from "@/fiscal/config/operation_options";
import { getOrderPostIssueRedirect } from "@/lib/order-post-issue";

async function runInlineFiscalWorker() {
  if (process.env.FISCAL_INLINE_WORKER === "0") return;

  const timeoutMs = 12_000;
  await Promise.race([
    processFiscalJobsOnce(2),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

function formatIssueError(error: unknown, ambiente: string) {
  if (error instanceof OrderAlreadyHasInvoiceError) {
    return `Este pedido já possui NF vinculada (${error.invoiceSerie}/${error.invoiceNumber ?? "-"}, status ${error.invoiceStatus}).`;
  }
  if (error instanceof FiscalValidationError) {
    return `Pedido criado, mas não foi possível emitir a NF-e (${ambiente}). Corrija o cadastro e tente novamente: ${error.message}`;
  }
  const msg = error instanceof Error ? error.message : String(error);
  if (/Config Focus NFe inválida|FOCUS_NFE_/i.test(msg)) {
    return `Pedido criado, mas não foi possível emitir a NF-e (${ambiente}). A integração com a Focus não está configurada corretamente no ambiente.`;
  }
  if (/DATABASE_URL ausente|Supabase|Postgres/i.test(msg)) {
    return `Pedido criado, mas não foi possível emitir a NF-e (${ambiente}). O banco fiscal não está acessível no momento.`;
  }
  return `Pedido criado, mas falhou a emissão da NF-e (${ambiente}): ${msg}`;
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const input = parseCreateOrderFormData(formData);
  const orderId = createOrder(input);
  const orderPrintUrl = `/pedidos/${orderId}/imprimir`;
  const fiscalOperationCodeRaw = formData.get("fiscalOperationCode");
  const fiscalOperationCode = isPedidoFiscalOperationCode(fiscalOperationCodeRaw) ? fiscalOperationCodeRaw : undefined;

  try {
    const issued = await issueNfeForOrder(orderId, { fiscalOperationCode });
    await runInlineFiscalWorker().catch((e) => console.error("inline fiscal worker failed", e));
    const postAuthorizedRedirectTo = getOrderPostIssueRedirect(orderId);

    return Response.json(
      {
        ok: true,
        orderId,
        orderPrintUrl,
        invoiceId: issued.invoiceId,
        redirectTo: `/nota-fiscal?invoiceId=${encodeURIComponent(issued.invoiceId)}&autoprint=1`,
        postAuthorizedRedirectTo,
      },
      { status: 200 }
    );
  } catch (error) {
    const ambiente = getConfiguredFocusAmbiente();
    if (error instanceof OrderAlreadyHasInvoiceError) {
      return Response.json(
        {
          ok: false,
          orderId,
          orderPrintUrl,
          duplicate: true,
          invoiceId: error.invoiceId,
          redirectTo: `/nota-fiscal?invoiceId=${encodeURIComponent(error.invoiceId)}`,
          error: formatIssueError(error, ambiente),
        },
        { status: 409 }
      );
    }

    return Response.json(
      {
        ok: false,
        orderId,
        orderPrintUrl,
        error: formatIssueError(error, ambiente),
      },
      { status: 500 }
    );
  }
}
