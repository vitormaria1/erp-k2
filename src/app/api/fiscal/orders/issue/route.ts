import { issueNfeForOrder } from "@/fiscal/usecases/nfe_from_order";
import { getConfiguredFocusAmbiente } from "@/fiscal/providers/focus";
import { processFiscalJobsOnce } from "@/fiscal/worker/processor";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const orderId = Number(form.get("orderId"));
    if (!Number.isFinite(orderId)) {
      return new Response("orderId inválido", { status: 400 });
    }

    const issued = await issueNfeForOrder(orderId);

    // Dev convenience: process a couple jobs inline so the dashboard updates even without running `npm run fiscal:worker`.
    if (process.env.FISCAL_INLINE_WORKER !== "0") {
      void processFiscalJobsOnce(2).catch((e) => console.error("inline fiscal worker failed", e));
    }

    const url = new URL("/nota-fiscal", req.url);
    url.searchParams.set("invoiceId", issued.invoiceId);
    return Response.redirect(url, 303);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const ambiente = getConfiguredFocusAmbiente();
    const url = new URL("/nota-fiscal", req.url);
    url.searchParams.set("error", `Falha ao emitir NF-e (${ambiente}): ${msg}`);
    return Response.redirect(url, 303);
  }
}
