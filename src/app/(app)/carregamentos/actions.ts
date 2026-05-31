"use server";

import { randomUUID } from "node:crypto";

import { z } from "zod";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db";

const createSchema = z.object({
  orderIdsJson: z.string().min(2),
  notes: z.string().optional(),
});

export async function createLoadingAction(formData: FormData) {
  const parsed = createSchema.parse({
    orderIdsJson: formData.get("orderIdsJson")?.toString(),
    notes: formData.get("notes")?.toString(),
  });

  const orderIds = z.array(z.coerce.number().int().positive()).parse(JSON.parse(parsed.orderIdsJson));
  const uniq = Array.from(new Set(orderIds));
  if (uniq.length === 0) throw new Error("Selecione ao menos 1 pedido.");

  const db = getDb();
  const loadingId = randomUUID();

  const run = db.transaction(() => {
    db.prepare("INSERT INTO loadings (id, notes) VALUES (?, ?)").run(loadingId, parsed.notes ?? null);
    const stmt = db.prepare("INSERT INTO loading_orders (loading_id, order_id) VALUES (?, ?)");
    for (const id of uniq) stmt.run(loadingId, id);
  });
  run();

  redirect(`/carregamentos/${loadingId}/imprimir`);
}

