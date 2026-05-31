import type { FiscalDbClient, FiscalDbPool } from "../../infra/pg";

export async function withPgTx<T>(pool: FiscalDbPool, fn: (client: FiscalDbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    await client.release();
  }
}
