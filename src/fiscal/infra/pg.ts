import { Client } from "pg";

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

export function getFiscalDbPool(): FiscalDbPool {
  if (singleton) return singleton;

  const connectionString = (process.env.DATABASE_URL ?? "").trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL ausente. Configure o Supabase para a camada fiscal.");
  }

  singleton = pgPool(connectionString);
  return singleton;
}
