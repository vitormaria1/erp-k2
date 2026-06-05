import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

type RunResult = {
  changes: number;
  lastInsertRowid: string | number | null;
};

type QueryResult = {
  rows: unknown[];
  rowCount: number;
};

type DbResponse =
  | { id: number; ok: true; result: QueryResult | RunResult | null }
  | { id: number; ok: false; error: string };

type DbRequest = {
  id: number;
  type: "query" | "begin" | "commit" | "rollback";
  sql?: string;
  params?: unknown[];
};

type Statement = {
  run(...args: unknown[]): RunResult;
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
};

type DbHandle = {
  prepare(sql: string): Statement;
  transaction<T extends (...args: any[]) => any>(fn: T): (...args: Parameters<T>) => ReturnType<T>;
  exec(sql: string): void;
  close(): void;
};

let singleton: DbHandle | null = null;
const waitBuffer = new Int32Array(new SharedArrayBuffer(4));

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function translateSql(sql: string, params: unknown[]): { sql: string; params: unknown[] } {
  let nextIndex = 1;
  const collected: unknown[] = [];
  const trimmed = sql.trim();

  if (/^pragma\b/i.test(trimmed)) {
    return { sql: "select 1 as ok", params: [] };
  }

  const namedValues: Array<{ name: string; index: number }> = [];
  const namedMatch = trimmed.match(/@[a-zA-Z_][a-zA-Z0-9_]*/g);
  if (namedMatch && params.length === 1 && isPlainObject(params[0])) {
    const obj = params[0] as Record<string, unknown>;
    const seen = new Map<string, number>();
    sql = sql.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, name: string) => {
      if (!seen.has(name)) {
        seen.set(name, nextIndex++);
        namedValues.push({ name, index: seen.get(name)! });
        collected.push(obj[name] ?? null);
      }
      return `$${seen.get(name)}`;
    });
  } else {
    let positionalIndex = 0;
    sql = sql.replace(/\?/g, () => {
      const value = params[positionalIndex++];
      collected.push(value ?? null);
      return `$${positionalIndex}`;
    });
  }

  sql = sql
    .replace(/datetime\('now'\)/gi, "CURRENT_TIMESTAMP")
    .replace(/date\('now'\)/gi, "CURRENT_DATE")
    // Preserve camelCase aliases on Postgres. Unquoted identifiers are folded to lowercase.
    .replace(/\bAS\s+([a-z_][a-z0-9_]*[A-Z][A-Za-z0-9_]*)\b/g, 'AS "$1"')
    .replace(
      /strftime\('%Y-%m',\s*([^)]+?)\s*\)/gi,
      (_match, expr: string) => `to_char((${expr})::timestamp, 'YYYY-MM')`
    );

  if (/^\s*insert\b/i.test(sql) && !/\breturning\b/i.test(sql)) {
    sql = `${sql.trimEnd()} RETURNING *`;
  }

  return { sql, params: collected.length ? collected : params };
}

function normalizeArgs(args: unknown[]): unknown[] {
  if (args.length === 1 && Array.isArray(args[0])) return args[0] as unknown[];
  if (args.length === 1 && isPlainObject(args[0])) return [args[0]];
  return args;
}

function workerPath() {
  return path.join(process.cwd(), "scripts", "pg-db-worker.mjs");
}

function pause(ms: number) {
  Atomics.wait(waitBuffer, 0, 0, ms);
}

function spawnWorker() {
  const dbUrl = (process.env.DATABASE_URL ?? "").trim();
  if (!dbUrl) {
    throw new Error("DATABASE_URL ausente. Configure o Postgres do Supabase para rodar o ERP.");
  }

  const script = workerPath();
  if (!fs.existsSync(script)) {
    throw new Error(`Worker de banco não encontrado: ${script}`);
  }

  const child = spawn(process.execPath, [script], {
    stdio: ["pipe", "pipe", "inherit"],
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
    },
  });

  if (!child.stdin || !child.stdout) {
    throw new Error("Falha ao inicializar worker de banco.");
  }

  return child;
}

class PgCompatDb implements DbHandle {
  private child = spawnWorker();
  private requestId = 0;
  private stdoutBuffer = "";

  private get stdinFd() {
    const fd =
      (this.child.stdio[0] as unknown as { fd?: number })?.fd ??
      (this.child.stdin as unknown as { _handle?: { fd?: number } })._handle?.fd;
    if (typeof fd !== "number") throw new Error("stdin do worker indisponível.");
    return fd;
  }

  private get stdoutFd() {
    const fd =
      (this.child.stdio[1] as unknown as { fd?: number })?.fd ??
      (this.child.stdout as unknown as { _handle?: { fd?: number } })._handle?.fd;
    if (typeof fd !== "number") throw new Error("stdout do worker indisponível.");
    return fd;
  }

  private readLine(): string {
    while (true) {
      const newline = this.stdoutBuffer.indexOf("\n");
      if (newline !== -1) {
        const line = this.stdoutBuffer.slice(0, newline);
        this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
        return line;
      }

      const chunk = Buffer.allocUnsafe(65536);
      let bytes = 0;
      try {
        bytes = fs.readSync(this.stdoutFd, chunk, 0, chunk.length, null);
      } catch (error) {
        const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
        if (code === "EAGAIN") {
          pause(10);
          continue;
        }
        throw error;
      }
      if (bytes <= 0) {
        throw new Error("Worker de banco terminou inesperadamente.");
      }
      this.stdoutBuffer += chunk.toString("utf8", 0, bytes);
    }
  }

  private send(request: Omit<DbRequest, "id">): DbResponse {
    const id = ++this.requestId;
    const payload: DbRequest = { id, ...request };
    fs.writeSync(this.stdinFd, `${JSON.stringify(payload)}\n`);

    while (true) {
      const line = this.readLine();
      if (!line.trim()) continue;
      const response = JSON.parse(line) as DbResponse;
      if (response.id !== id) continue;
      return response;
    }
  }

  private query(sql: string, params: unknown[]): QueryResult {
    const translated = translateSql(sql, params);
    const response = this.send({ type: "query", sql: translated.sql, params: translated.params as unknown[] });
    if (!response.ok) throw new Error((response as { ok: false; error: string }).error);
    return response.result as QueryResult;
  }

  prepare(sql: string): Statement {
    return {
      run: (...args: unknown[]) => {
        const params = normalizeArgs(args);
        const result = this.query(sql, params);
        const row = (result.rows[0] as Record<string, unknown> | undefined) ?? null;
        const lastInsertRowid =
          row && Object.prototype.hasOwnProperty.call(row, "id") ? (row.id as string | number | null) : null;
        return { changes: result.rowCount, lastInsertRowid };
      },
      get: (...args: unknown[]) => {
        const params = normalizeArgs(args);
        const result = this.query(sql, params);
        return result.rows[0];
      },
      all: (...args: unknown[]) => {
        const params = normalizeArgs(args);
        const result = this.query(sql, params);
        return result.rows;
      },
    };
  }

  transaction<T extends (...args: any[]) => any>(fn: T): (...args: Parameters<T>) => ReturnType<T> {
    return ((...args: Parameters<T>) => {
      const begin = this.send({ type: "begin" });
      if (!begin.ok) throw new Error((begin as { ok: false; error: string }).error);
      try {
        const result = fn(...args);
        const commit = this.send({ type: "commit" });
        if (!commit.ok) throw new Error((commit as { ok: false; error: string }).error);
        return result;
      } catch (error) {
        const rollback = this.send({ type: "rollback" });
        if (!rollback.ok) {
          console.error("rollback failed", (rollback as { ok: false; error: string }).error);
        }
        throw error;
      }
    }) as (...args: Parameters<T>) => ReturnType<T>;
  }

  exec(sql: string) {
    const translated = translateSql(sql, []);
    const response = this.send({ type: "query", sql: translated.sql, params: translated.params as unknown[] });
    if (!response.ok) throw new Error((response as { ok: false; error: string }).error);
  }

  close() {
    this.child.stdin.end();
    this.child.kill();
    singleton = null;
  }
}

export function getDb(): DbHandle {
  if (singleton) return singleton;
  singleton = new PgCompatDb();
  return singleton;
}
