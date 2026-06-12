import { getDb } from "@/lib/db";
import { ensureFinancialSchema } from "@/lib/financial-ledger";
import {
  buildBoletoPayloadUpdate,
  extractLinhaDigitavel,
  extractNossoNumero,
  SicrediCobrancaClient,
} from "@/lib/sicredi-cobranca";
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

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(boleto.payloadJson);
  } catch {
    return new Response("Boleto payload invalido", { status: 500 });
  }

  let linhaDigitavel = extractLinhaDigitavel(parsed);
  if (!linhaDigitavel) {
    const nossoNumero = extractNossoNumero(parsed);
    if (nossoNumero) {
      const client = new SicrediCobrancaClient();
      const consult = await client.consultarBoleto({ nossoNumero });
      linhaDigitavel = extractLinhaDigitavel(consult);

      if (linhaDigitavel) {
        const updatedPayload = buildBoletoPayloadUpdate(parsed, { nossoNumero, linhaDigitavel });
        db.prepare("UPDATE boletos SET payload_json = ? WHERE id = ?").run(JSON.stringify(updatedPayload), boleto.id);
      }
    }
  }

  if (!linhaDigitavel) {
    return new Response("Linha digitavel indisponivel para este boleto", { status: 409 });
  }

  const client = new SicrediCobrancaClient();
  const pdf = await client.baixarPdfPorLinhaDigitavel(linhaDigitavel);

  return pdfResponse(pdf, `boleto-${id}.pdf`);
}
