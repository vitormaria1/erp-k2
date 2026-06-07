"use server";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getDb } from "@/lib/db";
import { ensureCustomerRouteDay, ensureCustomerSchema } from "@/lib/customer-schema";

function assertWeekStartIso(value: string) {
  // Expect YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Semana inválida.");
  return value;
}

function getOrCreateRouteWeek(db: ReturnType<typeof getDb>, weekStart: string) {
  const existing = db
    .prepare("SELECT id FROM route_weeks WHERE week_start = ?")
    .get(weekStart) as { id: string } | undefined;
  if (existing) return existing.id;

  const id = randomUUID();
  db.prepare("INSERT INTO route_weeks (id, week_start) VALUES (?, ?)").run(id, weekStart);
  return id;
}

const addSchema = z.object({
  weekStart: z.string().min(10),
  weekday: z.coerce.number().int().min(1).max(5),
  customerId: z.string().min(1),
  notes: z.string().optional(),
});

export async function addRouteEntryAction(formData: FormData) {
  const parsed = addSchema.parse({
    weekStart: formData.get("weekStart"),
    weekday: formData.get("weekday"),
    customerId: formData.get("customerId"),
    notes: formData.get("notes")?.toString(),
  });
  const weekStart = assertWeekStartIso(parsed.weekStart);

  const db = getDb();
  ensureCustomerSchema(db);
  const run = db.transaction(() => {
    const weekId = getOrCreateRouteWeek(db, weekStart);

    const last = db
      .prepare(
        "SELECT COALESCE(MAX(sort_order), -1) as m FROM route_entries WHERE route_week_id = ? AND weekday = ?"
      )
      .get(weekId, parsed.weekday) as { m: number };
    const nextSort = Number(last.m ?? -1) + 1;

    db.prepare(
      `
      INSERT INTO route_entries (id, route_week_id, weekday, customer_id, status, notes, sort_order, updated_at)
      VALUES (?, ?, ?, ?, 'NONE', ?, ?, datetime('now'))
    `
    ).run(randomUUID(), weekId, parsed.weekday, parsed.customerId, parsed.notes?.trim() || null, nextSort);
    ensureCustomerRouteDay(db, parsed.customerId, parsed.weekday);
  });
  run();
}

const updateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["NONE", "MESSAGE_SENT", "ORDER_PLACED"]).optional(),
  notes: z.string().optional(),
});

export async function updateRouteEntryAction(formData: FormData) {
  const parsed = updateSchema.parse({
    id: formData.get("id"),
    status: formData.get("status")?.toString(),
    notes: formData.get("notes")?.toString(),
  });

  const db = getDb();
  const current = db
    .prepare("SELECT id, status, notes FROM route_entries WHERE id = ?")
    .get(parsed.id) as { id: string; status: string; notes: string | null } | undefined;
  if (!current) throw new Error("Item não encontrado.");

  const nextStatus = parsed.status ?? current.status;
  const nextNotes = typeof parsed.notes === "string" ? parsed.notes : current.notes;

  db.prepare(
    "UPDATE route_entries SET status = ?, notes = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(nextStatus, nextNotes?.trim() || null, parsed.id);
}

const removeSchema = z.object({ id: z.string().min(1) });
export async function removeRouteEntryAction(formData: FormData) {
  const parsed = removeSchema.parse({ id: formData.get("id") });
  const db = getDb();
  db.prepare("DELETE FROM route_entries WHERE id = ?").run(parsed.id);
}

const moveSchema = z.object({
  id: z.string().min(1),
  direction: z.enum(["UP", "DOWN"]),
});

export async function moveRouteEntryAction(formData: FormData) {
  const parsed = moveSchema.parse({
    id: formData.get("id"),
    direction: formData.get("direction"),
  });

  const db = getDb();
  const run = db.transaction(() => {
    const row = db
      .prepare(
        "SELECT id, route_week_id as weekId, weekday, sort_order as sortOrder FROM route_entries WHERE id = ?"
      )
      .get(parsed.id) as { id: string; weekId: string; weekday: number; sortOrder: number } | undefined;
    if (!row) throw new Error("Item não encontrado.");

    const neighbor = db
      .prepare(
        `
        SELECT id, sort_order as sortOrder
        FROM route_entries
        WHERE route_week_id = ? AND weekday = ? AND sort_order ${parsed.direction === "UP" ? "<" : ">"} ?
        ORDER BY sort_order ${parsed.direction === "UP" ? "DESC" : "ASC"}
        LIMIT 1
      `
      )
      .get(row.weekId, row.weekday, row.sortOrder) as { id: string; sortOrder: number } | undefined;
    if (!neighbor) return;

    db.prepare("UPDATE route_entries SET sort_order = ?, updated_at = datetime('now') WHERE id = ?").run(
      neighbor.sortOrder,
      row.id
    );
    db.prepare("UPDATE route_entries SET sort_order = ?, updated_at = datetime('now') WHERE id = ?").run(
      row.sortOrder,
      neighbor.id
    );
  });

  run();
}
