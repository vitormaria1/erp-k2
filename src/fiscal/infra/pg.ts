import path from "node:path";

import { Client } from "pg";
import { PGlite } from "@electric-sql/pglite";

export type FiscalDbClient = {
  query(text: string, params?: ReadonlyArray<unknown>): Promise<{ rows: unknown[]; rowCount: number }>;
  release(): Promise<void>;
};

export type FiscalDbPool = {
  connect(): Promise<FiscalDbClient>;
  query(text: string, params?: ReadonlyArray<unknown>): Promise<{ rows: unknown[]; rowCount: number }>;
};

let singleton: FiscalDbPool | null = null;

class Mutex {
  private locked = false;
  private waiters: Array<() => void> = [];

  async lock(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.unlock();
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.locked = true;
    return () => this.unlock();
  }

  private unlock() {
    const next = this.waiters.shift();
    if (next) {
      next();
      return;
    }
    this.locked = false;
  }
}

function pgPool(connectionString: string): FiscalDbPool {
  async function connectClient() {
    const client = new Client({ connectionString });
    await client.connect();
    return client;
  }
  return {
    async connect() {
      const client = await connectClient();
      return {
        query: async (text, params) => {
          const res = await client.query(text, params as unknown[]);
          return { rows: res.rows as unknown[], rowCount: res.rowCount ?? res.rows.length };
        },
        release: async () => {
          await client.end();
        },
      };
    },
    query: async (text, params) => {
      const client = await connectClient();
      try {
        const res = await client.query(text, params as unknown[]);
        return { rows: res.rows as unknown[], rowCount: res.rowCount ?? res.rows.length };
      } finally {
        await client.end();
      }
    },
  };
}

function pgSingleConnectionPool(connectionString: string): FiscalDbPool {
  const mutex = new Mutex();
  let client: Client | null = null;
  let connecting: Promise<Client> | null = null;
  let openHolders = 0;
  let idleTimer: NodeJS.Timeout | null = null;

  function shouldResetClient(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      msg.includes("Connection terminated unexpectedly") ||
      msg.includes("ECONNRESET") ||
      msg.includes("EPIPE") ||
      msg.includes("ECONNREFUSED")
    );
  }

  function scheduleIdleClose() {
    // Default for the PGlite socket server: close the connection when idle to avoid stale sockets.
    if (process.env.FISCAL_PG_CLOSE_ON_IDLE === "0") return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => {
      if (openHolders !== 0) return;
      if (!client) return;
      const c = client;
      client = null;
      try {
        await c.end();
      } catch {
        // ignore
      }
    }, 50);
    // allow process to exit
    idleTimer.unref?.();
  }

  async function getClient() {
    if (client) return client;
    if (connecting) return connecting;
    connecting = (async () => {
      const c = new Client({ connectionString });
      await c.connect();
      client = c;
      connecting = null;
      return c;
    })();
    return connecting;
  }

  async function runQuery(text: string, params?: ReadonlyArray<unknown>) {
    const c = await getClient();
    try {
      const res = await c.query(text, params as unknown[]);
      return { rows: res.rows as unknown[], rowCount: res.rowCount ?? res.rows.length };
    } catch (e) {
      if (!shouldResetClient(e)) throw e;
      // reset and retry once
      try {
        await c.end();
      } catch {
        // ignore
      }
      client = null;
      connecting = null;
      const c2 = await getClient();
      const res2 = await c2.query(text, params as unknown[]);
      return { rows: res2.rows as unknown[], rowCount: res2.rowCount ?? res2.rows.length };
    }
  }

  return {
    async connect() {
      const unlock = await mutex.lock();
      openHolders += 1;
      return {
        query: async (text, params) => {
          return runQuery(text, params);
        },
        release: async () => {
          openHolders -= 1;
          unlock();
          scheduleIdleClose();
        },
      };
    },
    async query(text, params) {
      const unlock = await mutex.lock();
      openHolders += 1;
      try {
        return await runQuery(text, params);
      } finally {
        openHolders -= 1;
        unlock();
        scheduleIdleClose();
      }
    },
  };
}

function pglitePool(datadir: string): FiscalDbPool {
  // Não carregamos extensões aqui (ex.: pgcrypto) para evitar problemas de bundling/paths no runtime do Next.
  const db = new PGlite(datadir);
  const mutex = new Mutex();
  return {
    async connect() {
      const unlock = await mutex.lock();
      return {
        query: async (text, params) => {
          const res = (await db.query(text, params as unknown[])) as { rows: unknown[]; rowCount?: number };
          return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
        },
        release: async () => {
          unlock();
        },
      };
    },
    query: async (text, params) => {
      const unlock = await mutex.lock();
      try {
        const res = (await db.query(text, params as unknown[])) as { rows: unknown[]; rowCount?: number };
        return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
      } finally {
        unlock();
      }
    },
  };
}

export function getFiscalDbPool(): FiscalDbPool {
  if (singleton) return singleton;

  const connectionString = (process.env.FISCAL_DATABASE_URL ?? "").trim();
  if (!connectionString) {
    // Fallback local (no Docker/Postgres installed): embedded Postgres via PGlite.
    const datadir = path.join(process.cwd(), "data", "fiscal-pgdata");
    singleton = pglitePool(datadir);
    return singleton;
  }

  // Allow explicit pglite mode: FISCAL_DATABASE_URL="pglite:./data/fiscal-pgdata"
  if (connectionString.startsWith("pglite:")) {
    const p = connectionString.slice("pglite:".length);
    const datadir = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
    singleton = pglitePool(datadir);
    return singleton;
  }

  // PGlite socket server supports only one client connection at a time. Use a single shared connection.
  if (connectionString.includes("127.0.0.1:54323")) {
    singleton = pgSingleConnectionPool(connectionString);
    return singleton;
  }

  singleton = pgPool(connectionString);
  return singleton;
}
