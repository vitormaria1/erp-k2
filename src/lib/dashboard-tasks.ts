import { getDb } from "./db";

type DbLike = ReturnType<typeof getDb>;

let dashboardTaskSchemaReady = false;

export type DashboardTask = {
  id: string;
  title: string;
  notes: string | null;
  done: number;
  createdAt: string;
  updatedAt: string;
};

export function ensureDashboardTaskSchema(db: DbLike) {
  if (dashboardTaskSchemaReady) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS dashboard_tasks (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT,
      done BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_dashboard_tasks_done_updated ON dashboard_tasks(done, updated_at DESC)");

  dashboardTaskSchemaReady = true;
}

export function listDashboardTasks(limit = 12): DashboardTask[] {
  const db = getDb();
  ensureDashboardTaskSchema(db);

  return db
    .prepare(
      `
      SELECT
        id,
        title,
        notes,
        done,
        created_at as createdAt,
        updated_at as updatedAt
      FROM dashboard_tasks
      ORDER BY done ASC, updated_at DESC, created_at DESC
      LIMIT ?
    `
    )
    .all(limit) as DashboardTask[];
}
