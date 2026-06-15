import { getDb } from "./db";
import { ensureFinancialSchema } from "./financial-ledger";
import {
  buildBoletoPayloadUpdate,
  extractLinhaDigitavel,
  extractNossoNumero,
  SicrediCobrancaClient,
} from "./sicredi-cobranca";

export async function getBoletoPdfBuffer(receivableId: string) {
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
    .get(receivableId) as { id: string; payloadJson: string } | undefined;

  if (!boleto) {
    throw new Error("Boleto not found");
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(boleto.payloadJson);
  } catch {
    throw new Error("Boleto payload invalido");
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
    throw new Error("Linha digitavel indisponivel para este boleto");
  }

  const client = new SicrediCobrancaClient();
  return client.baixarPdfPorLinhaDigitavel(linhaDigitavel);
}
