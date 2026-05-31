import type { FiscalDbClient } from "../../infra/pg";
import { randomUUID } from "node:crypto";

export type FiscalJobStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED";

export type FiscalJobRow = {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  run_at: string;
  payload: unknown;
  last_error: string | null;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
};

export class FiscalJobRepositoryPg {
  async enqueue(args: {
    client: FiscalDbClient;
    kind: string;
    runAt?: Date;
    payload: unknown;
    invoiceId?: string;
  }): Promise<FiscalJobRow> {
    const res = await args.client.query(
      `
      INSERT INTO fiscal_jobs (id, kind, status, run_at, payload, invoice_id)
      VALUES ($1, $2, 'PENDING', COALESCE($3, now()), $4::jsonb, $5)
      RETURNING *
    `,
      [
        randomUUID(),
        args.kind,
        args.runAt?.toISOString() ?? null,
        JSON.stringify(args.payload),
        args.invoiceId ?? null,
      ]
    );
    return res.rows[0] as FiscalJobRow;
  }

  async pickNext(args: { client: FiscalDbClient; kinds?: string[] }): Promise<FiscalJobRow | null> {
    const kinds = args.kinds?.length ? args.kinds : null;
    const res = await args.client.query(
      `
      SELECT *
      FROM fiscal_jobs
      WHERE status = 'PENDING'
        AND run_at <= now()
        AND ($1::text[] IS NULL OR kind = ANY($1::text[]))
      ORDER BY run_at ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `,
      [kinds]
    );
    const job = (res.rows[0] as FiscalJobRow | undefined) ?? null;
    if (!job) return null;

    await args.client.query(
      "UPDATE fiscal_jobs SET status='RUNNING', attempts=attempts+1, updated_at=now() WHERE id=$1",
      [job.id]
    );
    return job;
  }

  async updatePayload(args: { client: FiscalDbClient; jobId: string; payload: unknown }): Promise<void> {
    await args.client.query("UPDATE fiscal_jobs SET payload=$2::jsonb, updated_at=now() WHERE id=$1", [
      args.jobId,
      JSON.stringify(args.payload),
    ]);
  }

  async markDone(args: { client: FiscalDbClient; jobId: string }): Promise<void> {
    await args.client.query("UPDATE fiscal_jobs SET status='DONE', updated_at=now() WHERE id=$1", [args.jobId]);
  }

  async markFailed(args: { client: FiscalDbClient; jobId: string; error: string; retryAt?: Date }): Promise<void> {
    const retryAt = args.retryAt?.toISOString() ?? null;
    await args.client.query(
      `
      UPDATE fiscal_jobs
      SET
        status = CASE WHEN $3::timestamptz IS NULL THEN 'FAILED' ELSE 'PENDING' END,
        run_at = COALESCE($3::timestamptz, run_at),
        last_error = $2,
        updated_at = now()
      WHERE id = $1
    `,
      [args.jobId, args.error.slice(0, 4000), retryAt]
    );
  }
}
