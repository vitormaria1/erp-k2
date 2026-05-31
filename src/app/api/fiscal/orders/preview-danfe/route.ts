import { previewDanfeForOrder } from "@/fiscal/usecases/nfe_from_order";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const orderId = Number(form.get("orderId"));
    if (!Number.isFinite(orderId)) {
      return new Response("orderId inválido", { status: 400 });
    }

    const { publicPath } = await previewDanfeForOrder(orderId);
    return Response.redirect(new URL(publicPath, req.url), 303);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Falha no preview DANFE: ${msg}`, { status: 500 });
  }
}
