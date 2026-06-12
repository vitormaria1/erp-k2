import { previewDanfeForOrder } from "@/fiscal/usecases/nfe_from_order";
import { isPedidoFiscalOperationCode } from "@/fiscal/config/operation_options";
import { redirectToPublicUrl } from "@/app/api/_utils/public-origin";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const orderId = Number(form.get("orderId"));
    if (!Number.isFinite(orderId)) {
      return new Response("orderId inválido", { status: 400 });
    }
    const fiscalOperationCodeRaw = form.get("fiscalOperationCode");
    const fiscalOperationCode = isPedidoFiscalOperationCode(fiscalOperationCodeRaw) ? fiscalOperationCodeRaw : undefined;

    const { publicPath } = await previewDanfeForOrder(orderId, { fiscalOperationCode });
    return redirectToPublicUrl(req, publicPath, 303);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Falha no preview DANFE: ${msg}`, { status: 500 });
  }
}
