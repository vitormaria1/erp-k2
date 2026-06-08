"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { ensureDashboardTaskSchema } from "@/lib/dashboard-tasks";

const textField = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = (value ?? "").trim();
    return trimmed.length ? trimmed : null;
  });

const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Informe a tarefa."),
  notes: textField,
});

const updateTaskSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1, "Informe a tarefa."),
  notes: textField,
  done: z.coerce.boolean().default(false),
});

const toggleTaskSchema = z.object({
  id: z.string().trim().min(1),
  done: z.coerce.boolean().default(false),
});

const deleteTaskSchema = z.object({
  id: z.string().trim().min(1),
});

export async function createDashboardTaskAction(formData: FormData) {
  const parsed = createTaskSchema.parse({
    title: formData.get("title")?.toString(),
    notes: formData.get("notes")?.toString(),
  });

  const db = getDb();
  ensureDashboardTaskSchema(db);
  db.prepare(
    `
    INSERT INTO dashboard_tasks (id, title, notes, done, updated_at)
    VALUES (?, ?, ?, FALSE, datetime('now'))
  `
  ).run(randomUUID(), parsed.title, parsed.notes);

  revalidatePath("/dashboard");
}

export async function updateDashboardTaskAction(formData: FormData) {
  const parsed = updateTaskSchema.parse({
    id: formData.get("id")?.toString(),
    title: formData.get("title")?.toString(),
    notes: formData.get("notes")?.toString(),
    done: formData.get("done") === "on",
  });

  const db = getDb();
  ensureDashboardTaskSchema(db);
  db.prepare(
    `
    UPDATE dashboard_tasks
    SET title = ?, notes = ?, done = ?, updated_at = datetime('now')
    WHERE id = ?
  `
  ).run(parsed.title, parsed.notes, parsed.done ? 1 : 0, parsed.id);

  revalidatePath("/dashboard");
}

export async function toggleDashboardTaskDoneAction(formData: FormData) {
  const parsed = toggleTaskSchema.parse({
    id: formData.get("id")?.toString(),
    done: formData.get("done") === "1",
  });

  const db = getDb();
  ensureDashboardTaskSchema(db);
  db.prepare(
    `
    UPDATE dashboard_tasks
    SET done = ?, updated_at = datetime('now')
    WHERE id = ?
  `
  ).run(parsed.done ? 1 : 0, parsed.id);

  revalidatePath("/dashboard");
}

export async function deleteDashboardTaskAction(formData: FormData) {
  const parsed = deleteTaskSchema.parse({
    id: formData.get("id")?.toString(),
  });

  const db = getDb();
  ensureDashboardTaskSchema(db);
  db.prepare("DELETE FROM dashboard_tasks WHERE id = ?").run(parsed.id);

  revalidatePath("/dashboard");
}
