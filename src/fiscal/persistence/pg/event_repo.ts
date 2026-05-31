import { randomUUID } from "node:crypto";
import type { FiscalDbClient } from "../../infra/pg";

export type FiscalEventRow = {
  id: string;
  invoice_id: string;
  type: string;
  version: number;
  payload: unknown;
  created_at: string;
};

export class FiscalEventRepositoryPg {
  async append(args: {
    client: FiscalDbClient;
    invoiceId: string;
    type: string;
    payload: unknown;
  }): Promise<FiscalEventRow> {
    // Versioning: per-invoice monotonic int
    const verRes = await args.client.query("SELECT COALESCE(MAX(version), 0) + 1 AS v FROM fiscal_events WHERE invoice_id=$1", [
      args.invoiceId,
    ]);
    const version = Number((verRes.rows[0] as { v: number }).v);

    const res = await args.client.query(
      `
      INSERT INTO fiscal_events (id, invoice_id, type, version, payload)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING *
    `,
      [randomUUID(), args.invoiceId, args.type, version, JSON.stringify(args.payload)]
    );
    return res.rows[0] as FiscalEventRow;
  }
}

