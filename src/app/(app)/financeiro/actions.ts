"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb } from "@/lib/db";
import {
  ensureFinancialSchema,
  updateReceivablePaymentMethod,
  updatePayableLedgerStatus,
  updateReceivableLedgerStatus,
} from "@/lib/financial-ledger";
import { ORDER_PAYMENT_METHOD_VALUES } from "@/lib/payments";
import {
  buildBoletoPayloadUpdate,
  extractNossoNumero,
  SicrediApiError,
  SicrediCobrancaClient,
} from "@/lib/sicredi-cobranca";
import {
  closeRouteOrder,
  startRouteClosure,
  updateOrderStatusWithFinancialSync,
} from "@/lib/order-finance-sync";
import {
  SIMPLE_FINANCE_PIN,
  createFinanceSession,
  clearFinanceSession,
  isAuthenticated,
  isFinanceAuthenticated,
} from "@/lib/simple-auth";

import { ORDER_STATUS_VALUES } from "../pedidos/status";

export type FinanceUnlockState = {
  error: string | null;
  unlocked: boolean;
};

const receivableSchema = z.object({ receivableId: z.string().min(1) });
const receivableStatusSchema = z.object({
  status: z.enum(["OPEN", "PAID", "OVERDUE", "CANCELED"]),
  effectiveDate: z.string().optional(),
  method: z.enum(ORDER_PAYMENT_METHOD_VALUES),
  dueDate: z.string().optional(),
});

const payablePaymentSchema = z.object({
  payableId: z.string().min(1),
  effectiveDate: z.string().optional(),
});

const receivableSettlementSchema = z.object({
  receivableId: z.string().min(1),
  effectiveDate: z.string().optional(),
  method: z.enum(ORDER_PAYMENT_METHOD_VALUES),
  dueDate: z.string().optional(),
});

const payableStatusSchema = z.object({
  status: z.enum(["PENDING", "PAID", "CANCELED"]),
  effectiveDate: z.string().optional(),
});

const orderStatusSchema = z.object({
  status: z.enum(ORDER_STATUS_VALUES),
});

const routeCloseSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  mode: z.enum(["PAID", "OPEN"]),
  effectiveDate: z.string().optional(),
});

const routeStartSchema = z.object({
  loadingId: z.string().min(1),
});

const financePinSchema = z.object({
  pin: z.string().trim().regex(/^\d{4}$/),
});

function revalidateFinanceViews() {
  revalidatePath("/financeiro");
  revalidatePath("/pedidos");
  revalidatePath("/compras");
}

async function ensureFinanceAuthorized() {
  if (!(await isAuthenticated())) {
    throw new Error("Unauthorized");
  }
  if (!(await isFinanceAuthenticated())) {
    throw new Error("FinanceUnauthorized");
  }
}

type BoletoRow = {
  id: string;
  payloadJson: string;
};

function parseStoredBoleto(payloadJson: string | null | undefined) {
  if (!payloadJson) return null;
  try {
    return JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function appendBoletoInstruction(payload: Record<string, unknown> | null, instruction: Record<string, unknown>) {
  const base = payload ? { ...payload } : {};
  const history = Array.isArray(base.instructions) ? [...base.instructions] : [];
  history.push(instruction);
  return { ...base, instructions: history, updatedAt: new Date().toISOString() };
}

function updateStoredBoletoPayload(db: ReturnType<typeof getDb>, boletoId: string, payload: Record<string, unknown>) {
  db.prepare("UPDATE boletos SET payload_json = ? WHERE id = ?").run(JSON.stringify(payload), boletoId);
}

function isAlreadyLoweredError(error: unknown) {
  return error instanceof SicrediApiError && error.status === 422 && error.includesText("titulo ja baixado");
}

async function syncExistingBoletoIfNeeded(args: {
  db: ReturnType<typeof getDb>;
  receivableId: string;
  previousMethod: string;
  nextMethod: string;
  nextStatus: string;
  previousDueDate: string;
  nextDueDate: string;
}) {
  if (args.previousMethod !== "BOLETO") return;

  const boleto = args.db
    .prepare("SELECT id, payload_json as payloadJson FROM boletos WHERE receivable_id = ?")
    .get(args.receivableId) as BoletoRow | undefined;
  if (!boleto) return;

  const parsed = parseStoredBoleto(boleto.payloadJson);
  const nossoNumero = extractNossoNumero(parsed);
  if (!nossoNumero) {
    throw new Error("Boleto sem nossoNumero salvo. Nao foi possivel sincronizar a instrucao no Sicredi.");
  }

  const sicredi = new SicrediCobrancaClient();
  const previousDueDateInput = String(args.previousDueDate).slice(0, 10);
  const nextDueDateInput = String(args.nextDueDate).slice(0, 10);
  const shouldLower = args.nextStatus === "CANCELED" || args.nextMethod !== "BOLETO";
  const shouldUpdateDueDate =
    !shouldLower && args.nextMethod === "BOLETO" && args.nextStatus !== "PAID" && previousDueDateInput !== nextDueDateInput;

  let nextPayload = buildBoletoPayloadUpdate(parsed, { nossoNumero }) as Record<string, unknown> | null;

  if (shouldLower) {
    try {
      const result = await sicredi.baixarBoleto(nossoNumero);
      nextPayload = appendBoletoInstruction(nextPayload, {
        type: "BAIXA",
        requestedAt: new Date().toISOString(),
        request: result.request,
        response: result.response,
      });
    } catch (error) {
      if (!isAlreadyLoweredError(error)) throw error;
      nextPayload = appendBoletoInstruction(nextPayload, {
        type: "BAIXA",
        requestedAt: new Date().toISOString(),
        status: "IGNORED_ALREADY_LOWERED",
      });
    }
  } else if (shouldUpdateDueDate) {
    const result = await sicredi.alterarDataVencimento(nossoNumero, nextDueDateInput);
    nextPayload = appendBoletoInstruction(nextPayload, {
      type: "ALTERA_VENCIMENTO",
      requestedAt: new Date().toISOString(),
      request: result.request,
      response: result.response,
      dueDate: nextDueDateInput,
    });
  }

  if (nextPayload) {
    nextPayload.dueDate = nextDueDateInput;
    if (shouldLower) nextPayload.status = "BAIXADO_SOLICITACAO";
    updateStoredBoletoPayload(args.db, boleto.id, nextPayload);
  }
}

export async function financeUnlockAction(
  _prevState: FinanceUnlockState,
  formData: FormData
): Promise<FinanceUnlockState> {
  if (!(await isAuthenticated())) {
    return { error: "Sessao expirada. Entre novamente.", unlocked: false };
  }

  const { pin } = financePinSchema.parse({
    pin: formData.get("pin"),
  });

  if (pin !== SIMPLE_FINANCE_PIN) {
    return { error: "PIN invalido.", unlocked: false };
  }

  await createFinanceSession();
  revalidatePath("/financeiro");
  return { error: null, unlocked: true };
}

export async function financeLockAction() {
  await clearFinanceSession();
  revalidatePath("/financeiro");
}

export async function gerarBoletoAction(formData: FormData) {
  await ensureFinanceAuthorized();

  const { receivableId } = receivableSchema.parse({ receivableId: formData.get("receivableId") });
  const db = getDb();
  ensureFinancialSchema(db);

  const receivable = db
    .prepare(
      `
      SELECT
        r.id,
        r.order_id as orderId,
        r.amount,
        r.due_date as dueDate,
        r.method,
        c.name as customerName,
        c.cnpj as customerDocument,
        c.street as customerStreet,
        c.number as customerNumber,
        c.complement as customerComplement,
        c.neighborhood as customerNeighborhood,
        c.city as customerCity,
        c.uf as customerUf,
        c.cep as customerCep,
        c.phone as customerPhone,
        c.email as customerEmail
      FROM receivables r
      JOIN customers c ON c.id = r.customer_id
      WHERE r.id = ?
    `
    )
    .get(receivableId) as
    | {
        id: string;
        orderId: number | null;
        amount: number;
        dueDate: string;
        method: string;
        customerName: string;
        customerDocument: string | null;
        customerStreet: string | null;
        customerNumber: string | null;
        customerComplement: string | null;
        customerNeighborhood: string | null;
        customerCity: string | null;
        customerUf: string | null;
        customerCep: string | null;
        customerPhone: string | null;
        customerEmail: string | null;
      }
    | undefined;

  if (!receivable) throw new Error("Recebivel nao encontrado.");
  if (receivable.method !== "BOLETO") throw new Error("Recebivel nao e BOLETO.");

  const exists = db.prepare("SELECT 1 FROM boletos WHERE receivable_id = ?").get(receivableId);
  if (exists) {
    revalidateFinanceViews();
    return;
  }

  const sicredi = new SicrediCobrancaClient();
  const result = await sicredi.emitirBoleto({
    receivableId,
    orderId: receivable.orderId,
    amount: Number(receivable.amount ?? 0),
    dueDate: String(receivable.dueDate).slice(0, 10),
    customer: {
      name: receivable.customerName,
      document: receivable.customerDocument ?? "",
      street: receivable.customerStreet ?? "",
      number: receivable.customerNumber,
      complement: receivable.customerComplement,
      neighborhood: receivable.customerNeighborhood,
      city: receivable.customerCity ?? "",
      uf: receivable.customerUf ?? "",
      cep: receivable.customerCep ?? "",
      phone: receivable.customerPhone,
      email: receivable.customerEmail,
    },
  });

  db.transaction(() => {
    const r = db.prepare("SELECT 1 FROM receivables WHERE id = ?").get(receivableId) as unknown;
    if (!r) throw new Error("Recebivel nao encontrado.");

    const payload = {
      id: randomUUID(),
      receivableId,
      customerName: receivable.customerName,
      amount: receivable.amount,
      dueDate: receivable.dueDate,
      provider: "sicredi",
      nossoNumero: result.nossoNumero,
      linhaDigitavel: result.linhaDigitavel,
      createdAt: new Date().toISOString(),
      request: result.request,
      response: result.response,
    };

    db.prepare("INSERT INTO boletos (id, receivable_id, payload_json) VALUES (?, ?, ?)").run(
      payload.id,
      receivableId,
      JSON.stringify(payload)
    );
  })();
  revalidateFinanceViews();
}

export async function updateReceivableStatusAction(receivableId: string, formData: FormData) {
  await ensureFinanceAuthorized();

  const { status, effectiveDate, method, dueDate } = receivableStatusSchema.parse({
    status: formData.get("status"),
    effectiveDate: formData.get("effectiveDate")?.toString(),
    method: formData.get("method"),
    dueDate: formData.get("dueDate")?.toString(),
  });

  const db = getDb();
  ensureFinancialSchema(db);
  const receivable = db
    .prepare("SELECT status, method, due_date as dueDate FROM receivables WHERE id = ?")
    .get(receivableId) as { status: string; method: string; dueDate: string } | undefined;
  if (!receivable) throw new Error("Recebivel nao encontrado.");

  const nextDueDate = dueDate?.trim() ? dueDate : String(receivable.dueDate).slice(0, 10);
  await syncExistingBoletoIfNeeded({
    db,
    receivableId,
    previousMethod: receivable.method,
    nextMethod: method,
    nextStatus: status,
    previousDueDate: receivable.dueDate,
    nextDueDate,
  });

  updateReceivablePaymentMethod({ db, receivableId, method, dueDate });
  updateReceivableLedgerStatus({
    db,
    receivableId,
    status,
    effectiveDate,
  });

  revalidateFinanceViews();
}

export async function settleReceivableAction(formData: FormData) {
  await ensureFinanceAuthorized();

  const { receivableId, effectiveDate, method, dueDate } = receivableSettlementSchema.parse({
    receivableId: formData.get("receivableId"),
    effectiveDate: formData.get("effectiveDate")?.toString(),
    method: formData.get("method"),
    dueDate: formData.get("dueDate")?.toString(),
  });
  const db = getDb();
  ensureFinancialSchema(db);
  const receivable = db
    .prepare("SELECT status, method, due_date as dueDate FROM receivables WHERE id = ?")
    .get(receivableId) as { status: string; method: string; dueDate: string } | undefined;
  if (!receivable) throw new Error("Recebivel nao encontrado.");

  const nextDueDate = dueDate?.trim() ? dueDate : String(receivable.dueDate).slice(0, 10);
  await syncExistingBoletoIfNeeded({
    db,
    receivableId,
    previousMethod: receivable.method,
    nextMethod: method,
    nextStatus: "PAID",
    previousDueDate: receivable.dueDate,
    nextDueDate,
  });

  updateReceivablePaymentMethod({ db, receivableId, method, dueDate });
  updateReceivableLedgerStatus({ db, receivableId, status: "PAID", effectiveDate });
  revalidateFinanceViews();
}

export async function updatePayableStatusAction(payableId: string, formData: FormData) {
  await ensureFinanceAuthorized();

  const { status, effectiveDate } = payableStatusSchema.parse({
    status: formData.get("status"),
    effectiveDate: formData.get("effectiveDate")?.toString(),
  });

  const db = getDb();
  ensureFinancialSchema(db);
  updatePayableLedgerStatus({
    db,
    payableId,
    status,
    effectiveDate,
  });

  revalidateFinanceViews();
}

export async function settlePayableAction(formData: FormData) {
  await ensureFinanceAuthorized();

  const { payableId, effectiveDate } = payablePaymentSchema.parse({
    payableId: formData.get("payableId"),
    effectiveDate: formData.get("effectiveDate")?.toString(),
  });
  const db = getDb();
  ensureFinancialSchema(db);
  updatePayableLedgerStatus({ db, payableId, status: "PAID", effectiveDate });
  revalidateFinanceViews();
}

export async function updateFinanceOrderStatusAction(orderId: number, formData: FormData) {
  await ensureFinanceAuthorized();

  const { status } = orderStatusSchema.parse({
    status: formData.get("status"),
  });

  const db = getDb();
  updateOrderStatusWithFinancialSync(db, orderId, status);
  revalidateFinanceViews();
}

export async function closeRouteOrderAction(formData: FormData) {
  await ensureFinanceAuthorized();

  const { orderId, mode } = routeCloseSchema.parse({
    orderId: formData.get("orderId"),
    mode: formData.get("mode"),
    effectiveDate: formData.get("effectiveDate")?.toString(),
  });

  const db = getDb();
  closeRouteOrder(db, orderId, mode, formData.get("effectiveDate")?.toString());
  revalidateFinanceViews();
}

export async function startRouteClosureAction(formData: FormData) {
  await ensureFinanceAuthorized();

  const { loadingId } = routeStartSchema.parse({
    loadingId: formData.get("loadingId"),
  });

  const db = getDb();
  startRouteClosure(db, loadingId);
  revalidateFinanceViews();
}
