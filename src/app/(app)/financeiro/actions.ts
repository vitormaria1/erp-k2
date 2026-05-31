"use server";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getDb } from "@/lib/db";

const schema = z.object({ receivableId: z.string().min(1) });

function fakeLinhaDigitavel() {
  const digits = Array.from({ length: 47 }, () => Math.floor(Math.random() * 10)).join("");
  return digits;
}

export async function gerarBoletoMockAction(formData: FormData) {
  const { receivableId } = schema.parse({ receivableId: formData.get("receivableId") });
  const db = getDb();

  const run = db.transaction(() => {
    const r = db
      .prepare(
        `
        SELECT r.id, r.amount, r.due_date as dueDate, r.method, c.name as customerName
        FROM receivables r
        JOIN customers c ON c.id = r.customer_id
        WHERE r.id = ?
      `
      )
      .get(receivableId) as
      | { id: string; amount: number; dueDate: string; method: string; customerName: string }
      | undefined;
    if (!r) throw new Error("Recebível não encontrado.");
    if (r.method !== "BOLETO") throw new Error("Recebível não é BOLETO.");

    const exists = db.prepare("SELECT 1 FROM boletos WHERE receivable_id = ?").get(receivableId);
    if (exists) return;

    const payload = {
      id: randomUUID(),
      receivableId,
      customerName: r.customerName,
      amount: r.amount,
      dueDate: r.dueDate,
      linhaDigitavel: fakeLinhaDigitavel(),
      createdAt: new Date().toISOString(),
      provider: "mock",
    };

    db.prepare("INSERT INTO boletos (id, receivable_id, payload_json) VALUES (?, ?, ?)").run(
      payload.id,
      receivableId,
      JSON.stringify(payload)
    );
  });

  run();
}

