import { createOrder, parseCreateOrderFormData } from "@/app/(app)/pedidos/novo/create-order";

export async function POST(req: Request) {
  const formData = await req.formData();
  const input = parseCreateOrderFormData(formData);
  const orderId = createOrder(input);

  return Response.json(
    {
      ok: true,
      orderId,
      orderPrintUrl: `/pedidos/${orderId}/imprimir`,
    },
    { status: 200 }
  );
}
