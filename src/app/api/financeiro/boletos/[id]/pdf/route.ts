import { getDb } from "@/lib/db";
import { ensureFinancialSchema } from "@/lib/financial-ledger";
import { getBoletoPdfBuffer } from "@/lib/boleto-pdf";
import { isAuthenticated } from "@/lib/simple-auth";

function pdfResponse(pdf: Buffer, filename: string) {
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await ctx.params;
  const db = getDb();
  ensureFinancialSchema(db);

  const boleto = db
    .prepare(
      `
      SELECT b.id, b.payload_json as payloadJson
      FROM boletos b
      WHERE b.receivable_id = ?
    `
    )
    .get(id) as { id: string; payloadJson: string } | undefined;

  if (!boleto) {
    return new Response("Boleto not found", { status: 404 });
  }

  try {
    const pdf = await getBoletoPdfBuffer(id);
    return pdfResponse(pdf, `boleto-${id}.pdf`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Boleto payload invalido") {
      return new Response(message, { status: 500 });
    }
    if (message === "Linha digitavel indisponivel para este boleto") {
      return new Response(message, { status: 409 });
    }
    if (message === "Boleto not found") {
      return new Response(message, { status: 404 });
    }
    throw error;
  }
}
