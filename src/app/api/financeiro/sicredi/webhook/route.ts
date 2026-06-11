import { revalidatePath } from "next/cache";

import { processSicrediWebhookEvent } from "@/lib/sicredi-webhook";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON invalido" }, { status: 400 });
  }

  try {
    const result = processSicrediWebhookEvent(body);
    revalidatePath("/financeiro");
    revalidatePath("/pedidos");
    return Response.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar webhook";
    return Response.json({ error: message }, { status: 400 });
  }
}
