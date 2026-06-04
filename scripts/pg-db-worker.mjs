import readline from "node:readline";

import pg from "pg";

const { Pool } = pg;

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL ausente.");
  }
  const ssl =
    connectionString.includes("supabase.co") || connectionString.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined;
  return new Pool({ connectionString, ssl });
}

const pool = createPool();
let txClient = null;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function execute(sql, params) {
  if (/^\s*select\s+1\s+as\s+ok\s*$/i.test(sql)) {
    return { rows: [{ ok: 1 }], rowCount: 1 };
  }
  const client = txClient ?? pool;
  const result = await client.query(sql, params);
  return {
    rows: result.rows ?? [],
    rowCount: typeof result.rowCount === "number" ? result.rowCount : (result.rows ?? []).length,
  };
}

async function handle(request) {
  try {
    if (request.type === "begin") {
      if (txClient) throw new Error("Transação já aberta.");
      txClient = await pool.connect();
      await txClient.query("BEGIN");
      return { id: request.id, ok: true, result: null };
    }

    if (request.type === "commit") {
      if (!txClient) throw new Error("Nenhuma transação aberta.");
      await txClient.query("COMMIT");
      txClient.release();
      txClient = null;
      return { id: request.id, ok: true, result: null };
    }

    if (request.type === "rollback") {
      if (!txClient) throw new Error("Nenhuma transação aberta.");
      await txClient.query("ROLLBACK");
      txClient.release();
      txClient = null;
      return { id: request.id, ok: true, result: null };
    }

    const sql = request.sql ?? "";
    const params = Array.isArray(request.params) ? request.params : [];
    const result = await execute(sql, params);
    return { id: request.id, ok: true, result };
  } catch (error) {
    return { id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let request;
  try {
    request = JSON.parse(line);
  } catch (error) {
    send({ id: -1, ok: false, error: error instanceof Error ? error.message : String(error) });
    return;
  }

  const response = await handle(request);
  send(response);
});

process.on("SIGTERM", async () => {
  try {
    if (txClient) {
      await txClient.query("ROLLBACK");
      txClient.release();
      txClient = null;
    }
  } catch {
    // ignore
  } finally {
    await pool.end().catch(() => undefined);
    process.exit(0);
  }
});
