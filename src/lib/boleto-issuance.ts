import { randomUUID } from "node:crypto";

import { getDb } from "./db";
import { ensureFinancialSchema } from "./financial-ledger";
import { SicrediCobrancaClient } from "./sicredi-cobranca";

export async function generateBoletoForReceivable(receivableId: string) {
  const db = getDb();
  ensureFinancialSchema(db);

  const receivable = db
    .prepare(
      `
      SELECT
        r.id,
        r.order_id as orderId,
        r.amount,
        r.due_date as dueDate,
        r.method,
        c.name as customerName,
        c.cnpj as customerDocument,
        c.street as customerStreet,
        c.number as customerNumber,
        c.complement as customerComplement,
        c.neighborhood as customerNeighborhood,
        c.city as customerCity,
        c.uf as customerUf,
        c.cep as customerCep,
        c.phone as customerPhone,
        c.email as customerEmail
      FROM receivables r
      JOIN customers c ON c.id = r.customer_id
      WHERE r.id = ?
    `
    )
    .get(receivableId) as
    | {
        id: string;
        orderId: number | null;
        amount: number;
        dueDate: string;
        method: string;
        customerName: string;
        customerDocument: string | null;
        customerStreet: string | null;
        customerNumber: string | null;
        customerComplement: string | null;
        customerNeighborhood: string | null;
        customerCity: string | null;
        customerUf: string | null;
        customerCep: string | null;
        customerPhone: string | null;
        customerEmail: string | null;
      }
    | undefined;

  if (!receivable) throw new Error("Recebivel nao encontrado.");
  if (receivable.method !== "BOLETO") throw new Error("Recebivel nao e BOLETO.");

  const exists = db.prepare("SELECT 1 FROM boletos WHERE receivable_id = ?").get(receivableId);
  if (exists) {
    return { alreadyExists: true as const };
  }

  const sicredi = new SicrediCobrancaClient();
  const result = await sicredi.emitirBoleto({
    receivableId,
    orderId: receivable.orderId,
    amount: Number(receivable.amount ?? 0),
    dueDate: String(receivable.dueDate).slice(0, 10),
    customer: {
      name: receivable.customerName,
      document: receivable.customerDocument ?? "",
      street: receivable.customerStreet ?? "",
      number: receivable.customerNumber,
      complement: receivable.customerComplement,
      neighborhood: receivable.customerNeighborhood,
      city: receivable.customerCity ?? "",
      uf: receivable.customerUf ?? "",
      cep: receivable.customerCep ?? "",
      phone: receivable.customerPhone,
      email: receivable.customerEmail,
    },
  });

  db.transaction(() => {
    const current = db.prepare("SELECT 1 FROM receivables WHERE id = ?").get(receivableId) as unknown;
    if (!current) throw new Error("Recebivel nao encontrado.");

    const payload = {
      id: randomUUID(),
      receivableId,
      customerName: receivable.customerName,
      amount: receivable.amount,
      dueDate: receivable.dueDate,
      provider: "sicredi",
      nossoNumero: result.nossoNumero,
      linhaDigitavel: result.linhaDigitavel,
      createdAt: new Date().toISOString(),
      request: result.request,
      response: result.response,
    };

    db.prepare("INSERT INTO boletos (id, receivable_id, payload_json) VALUES (?, ?, ?)").run(
      payload.id,
      receivableId,
      JSON.stringify(payload)
    );
  })();

  return { alreadyExists: false as const };
}
