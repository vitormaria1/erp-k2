import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getSaoPauloDateIso } from "@/lib/datetime";
import { getDb } from "@/lib/db";
import { ensureFinancialSchema, updateReceivableLedgerStatus } from "@/lib/financial-ledger";
import { buildBoletoPayloadUpdate } from "@/lib/sicredi-cobranca";

const SicrediWebhookEventSchema = z.object({
  agencia: z.string().trim().min(1),
  posto: z.string().trim().min(1),
  beneficiario: z.string().trim().min(1),
  nossoNumero: z.string().trim().min(1),
  dataEvento: z.array(z.coerce.number()).min(3),
  movimento: z.string().trim().min(1),
  valorLiquidacao: z.string().trim().optional(),
  valorDesconto: z.string().trim().optional(),
  valorJuros: z.string().trim().optional(),
  valorMulta: z.string().trim().optional(),
  valorAbatimento: z.string().trim().optional(),
  carteira: z.string().trim().optional(),
  dataPrevisaoPagamento: z.array(z.coerce.number()).min(3).optional(),
  idEventoWebhook: z.string().trim().min(1),
  idTituloEmpresa: z.string().trim().optional(),
});

type DbLike = ReturnType<typeof getDb>;
type SicrediWebhookEvent = z.infer<typeof SicrediWebhookEventSchema>;
type BoletoLookup = {
  id: string;
  receivableId: string;
  payloadJson: string;
  receivableStatus: string;
};

function parseDateTuple(tuple: number[]) {
  const [year, month, day, hour = 0, minute = 0, second = 0] = tuple;
  const isoDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const isoDateTime = `${isoDate} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
  return { isoDate, isoDateTime };
}

function parseMoney(value: string | undefined) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePayload(payloadJson: string | null | undefined) {
  if (!payloadJson) return null;
  try {
    return JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function appendWebhookState(payload: Record<string, unknown> | null, values: Record<string, unknown>) {
  const base = payload ? { ...payload } : {};
  const webhook = base.webhook && typeof base.webhook === "object" && !Array.isArray(base.webhook) ? { ...base.webhook } : {};
  const events = Array.isArray((webhook as Record<string, unknown>).events)
    ? ([...(webhook as { events: unknown[] }).events] as unknown[])
    : [];

  if (values.event) events.push(values.event);

  return {
    ...base,
    webhook: {
      ...webhook,
      ...values,
      events,
      updatedAt: new Date().toISOString(),
    },
  };
}

function updateBoletoPayload(db: DbLike, boletoId: string, payload: Record<string, unknown>) {
  db.prepare("UPDATE boletos SET payload_json = ? WHERE id = ?").run(JSON.stringify(payload), boletoId);
}

function markEventStatus(db: DbLike, eventId: string, status: string, receivableId?: string | null) {
  db.prepare(
    `
    UPDATE boleto_webhook_events
    SET receivable_id = COALESCE(?, receivable_id), processing_status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE event_id = ?
  `
  ).run(receivableId ?? null, status, eventId);
}

function findBoletoByWebhookRef(db: DbLike, event: SicrediWebhookEvent) {
  const eventIdTitle = event.idTituloEmpresa?.trim() ?? "";
  if (eventIdTitle) {
    const byReceivableId = db
      .prepare(
        `
        SELECT b.id, b.receivable_id as "receivableId", b.payload_json as "payloadJson", r.status as "receivableStatus"
        FROM boletos b
        JOIN receivables r ON r.id = b.receivable_id
        WHERE b.receivable_id = ?
        LIMIT 1
      `
      )
      .get(eventIdTitle) as BoletoLookup | undefined;
    if (byReceivableId) return byReceivableId;
  }

  return db
    .prepare(
      `
      SELECT b.id, b.receivable_id as "receivableId", b.payload_json as "payloadJson", r.status as "receivableStatus"
      FROM boletos b
      JOIN receivables r ON r.id = b.receivable_id
      WHERE b.payload_json::jsonb ->> 'nossoNumero' = ?
      ORDER BY b.created_at DESC
      LIMIT 1
    `
    )
    .get(event.nossoNumero) as BoletoLookup | undefined;
}

function isSettlementMovement(movimento: string) {
  return movimento.startsWith("LIQUIDACAO_");
}

function isDeferredSettlementMovement(movimento: string) {
  return movimento === "LIQUIDACAO_REDE";
}

function isReversalMovement(movimento: string) {
  return movimento === "ESTORNO_LIQUIDACAO_REDE";
}

function recordEvent(db: DbLike, event: SicrediWebhookEvent, status: string, receivableId?: string | null) {
  const exists = db.prepare("SELECT 1 FROM boleto_webhook_events WHERE event_id = ?").get(event.idEventoWebhook);
  if (exists) return false;

  const { isoDate, isoDateTime } = parseDateTuple(event.dataEvento);
  db.prepare(
    `
    INSERT INTO boleto_webhook_events
      (id, event_id, receivable_id, nosso_numero, movimento, event_date, event_at, amount, processing_status, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    randomUUID(),
    event.idEventoWebhook,
    receivableId ?? null,
    event.nossoNumero,
    event.movimento,
    isoDate,
    isoDateTime,
    parseMoney(event.valorLiquidacao),
    status,
    JSON.stringify(event)
  );
  return true;
}

export function reconcileDeferredSicrediSettlements() {
  const db = getDb();
  ensureFinancialSchema(db);

  const today = getSaoPauloDateIso();
  const pending = db
    .prepare(
      `
      SELECT event_id as "eventId", receivable_id as "receivableId", nosso_numero as "nossoNumero", event_date as "eventDate"
      FROM boleto_webhook_events
      WHERE processing_status = 'PENDING_CONFIRMATION'
        AND receivable_id IS NOT NULL
        AND event_date < ?
      ORDER BY event_date ASC, created_at ASC
    `
    )
    .all(today) as Array<{ eventId: string; receivableId: string; nossoNumero: string; eventDate: string }>;

  if (pending.length === 0) return 0;

  for (const item of pending) {
    updateReceivableLedgerStatus({
      db,
      receivableId: item.receivableId,
      status: "PAID",
      effectiveDate: item.eventDate,
    });

    const boleto = db
      .prepare("SELECT id, payload_json as payloadJson FROM boletos WHERE receivable_id = ?")
      .get(item.receivableId) as { id: string; payloadJson: string } | undefined;
    if (boleto) {
      const parsed = parsePayload(boleto.payloadJson);
      const nextPayload = appendWebhookState(buildBoletoPayloadUpdate(parsed, { nossoNumero: item.nossoNumero }), {
        pendingConfirmation: false,
        paidAt: item.eventDate,
        status: "PAID",
      });
      updateBoletoPayload(db, boleto.id, nextPayload);
    }

    markEventStatus(db, item.eventId, "PROCESSED_PAID", item.receivableId);
  }

  return pending.length;
}

export function getBoletoWebhookVisualState(payloadJson: string | null) {
  const payload = parsePayload(payloadJson);
  const webhook =
    payload && typeof payload === "object" && payload.webhook && typeof payload.webhook === "object" && !Array.isArray(payload.webhook)
      ? (payload.webhook as Record<string, unknown>)
      : null;
  if (!webhook) return null;

  return {
    status: typeof webhook.status === "string" ? webhook.status : null,
    pendingConfirmation: webhook.pendingConfirmation === true,
    paidAt: typeof webhook.paidAt === "string" ? webhook.paidAt : null,
    reversedAt: typeof webhook.reversedAt === "string" ? webhook.reversedAt : null,
    lastMovement: typeof webhook.lastMovement === "string" ? webhook.lastMovement : null,
  };
}

export function processSicrediWebhookEvent(rawEvent: unknown) {
  const event = SicrediWebhookEventSchema.parse(rawEvent);
  const db = getDb();
  ensureFinancialSchema(db);

  const boleto = findBoletoByWebhookRef(db, event);
  const initialStatus = boleto ? "RECEIVED" : "UNMATCHED";
  const inserted = recordEvent(db, event, initialStatus, boleto?.receivableId ?? null);
  if (!inserted) {
    return { duplicate: true, matched: Boolean(boleto) };
  }

  if (!boleto) {
    return { duplicate: false, matched: false };
  }

  const { isoDate, isoDateTime } = parseDateTuple(event.dataEvento);
  const parsed = parsePayload(boleto.payloadJson);
  let nextPayload = appendWebhookState(buildBoletoPayloadUpdate(parsed, { nossoNumero: event.nossoNumero }), {
    lastEventId: event.idEventoWebhook,
    lastEventAt: isoDateTime,
    lastMovement: event.movimento,
    event: {
      id: event.idEventoWebhook,
      movement: event.movimento,
      at: isoDateTime,
      amount: parseMoney(event.valorLiquidacao),
    },
  });

  if (isReversalMovement(event.movimento)) {
    if (boleto.receivableStatus === "PAID") {
      updateReceivableLedgerStatus({
        db,
        receivableId: boleto.receivableId,
        status: "OPEN",
      });
    }

    db.prepare(
      `
      UPDATE boleto_webhook_events
      SET processing_status = 'REVERSED', updated_at = CURRENT_TIMESTAMP
      WHERE receivable_id = ? AND movimento = 'LIQUIDACAO_REDE' AND event_date = ? AND processing_status = 'PENDING_CONFIRMATION'
    `
    ).run(boleto.receivableId, isoDate);

    nextPayload = appendWebhookState(nextPayload, {
      pendingConfirmation: false,
      reversedAt: isoDate,
      status: "ESTORNADO",
    });
    updateBoletoPayload(db, boleto.id, nextPayload);
    markEventStatus(db, event.idEventoWebhook, "PROCESSED_REVERSED", boleto.receivableId);
    return { duplicate: false, matched: true, deferred: false, reversed: true };
  }

  if (isSettlementMovement(event.movimento)) {
    if (isDeferredSettlementMovement(event.movimento)) {
      nextPayload = appendWebhookState(nextPayload, {
        pendingConfirmation: true,
        pendingReceivedAt: isoDateTime,
        status: "PENDING_CONFIRMATION",
      });
      updateBoletoPayload(db, boleto.id, nextPayload);
      markEventStatus(db, event.idEventoWebhook, "PENDING_CONFIRMATION", boleto.receivableId);
      return { duplicate: false, matched: true, deferred: true, reversed: false };
    }

    updateReceivableLedgerStatus({
      db,
      receivableId: boleto.receivableId,
      status: "PAID",
      effectiveDate: isoDate,
    });
    nextPayload = appendWebhookState(nextPayload, {
      pendingConfirmation: false,
      paidAt: isoDate,
      status: "PAID",
    });
    updateBoletoPayload(db, boleto.id, nextPayload);
    markEventStatus(db, event.idEventoWebhook, "PROCESSED_PAID", boleto.receivableId);
    return { duplicate: false, matched: true, deferred: false, reversed: false };
  }

  updateBoletoPayload(db, boleto.id, nextPayload);
  markEventStatus(db, event.idEventoWebhook, "IGNORED", boleto.receivableId);
  return { duplicate: false, matched: true, deferred: false, reversed: false };
}
