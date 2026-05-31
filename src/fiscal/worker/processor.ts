import { FocusNFeClient } from "../providers/focus";
import { getFiscalDbPool } from "../infra/pg";
import { withPgTx } from "../persistence/pg/tx";
import { FiscalEventRepositoryPg, FiscalInvoiceRepositoryPg, FiscalJobRepositoryPg } from "../persistence/pg";

function backoffSeconds(attempts: number) {
  const s = Math.min(60, 5 * Math.pow(2, Math.max(0, attempts - 1)));
  return Math.floor(s);
}

type IssueNfeJobPayload = {
  invoiceId: string;
  focusRef: string;
  payload: Record<string, unknown>;
  ambiente?: "homologacao" | "producao";
};

type PollNfeJobPayload = {
  invoiceId: string;
  focusRef: string;
  attempts?: number;
};

type CancelNfeJobPayload = {
  invoiceId: string;
  focusRef: string;
  justificativa: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getString(v: unknown, key: string): string | null {
  return isRecord(v) && typeof v[key] === "string" ? (v[key] as string) : null;
}

function asIssuePayload(v: unknown): IssueNfeJobPayload {
  if (!isRecord(v)) throw new Error("Invalid job payload");
  const invoiceId = String(v.invoiceId ?? "");
  const focusRef = String(v.focusRef ?? "");
  const payload = v.payload;
  if (!invoiceId || !focusRef || !isRecord(payload)) throw new Error("Invalid ISSUE_NFE payload");
  return { invoiceId, focusRef, payload: payload as Record<string, unknown> };
}

function asPollPayload(v: unknown): PollNfeJobPayload {
  if (!isRecord(v)) throw new Error("Invalid job payload");
  const invoiceId = String(v.invoiceId ?? "");
  const focusRef = String(v.focusRef ?? "");
  const attempts = typeof v.attempts === "number" ? v.attempts : 0;
  if (!invoiceId || !focusRef) throw new Error("Invalid POLL_NFE payload");
  return { invoiceId, focusRef, attempts };
}

function asCancelPayload(v: unknown): CancelNfeJobPayload {
  if (!isRecord(v)) throw new Error("Invalid job payload");
  const invoiceId = String(v.invoiceId ?? "");
  const focusRef = String(v.focusRef ?? "");
  const justificativa = String(v.justificativa ?? "");
  if (!invoiceId || !focusRef || justificativa.length < 15) throw new Error("Invalid CANCEL_NFE payload");
  return { invoiceId, focusRef, justificativa };
}

export type FiscalJobProcessorDeps = {
  focus?: FocusNFeClient;
  jobRepo?: FiscalJobRepositoryPg;
  invoiceRepo?: FiscalInvoiceRepositoryPg;
  eventRepo?: FiscalEventRepositoryPg;
};

export async function processNextFiscalJob(
  deps: FiscalJobProcessorDeps = {}
): Promise<{ handled: boolean; jobId?: string; kind?: string }> {
  const pool = getFiscalDbPool();
  const focus = deps.focus ?? new FocusNFeClient();
  const jobRepo = deps.jobRepo ?? new FiscalJobRepositoryPg();
  const invoiceRepo = deps.invoiceRepo ?? new FiscalInvoiceRepositoryPg();
  const eventRepo = deps.eventRepo ?? new FiscalEventRepositoryPg();

  const job = await withPgTx(pool, async (client) => {
    return jobRepo.pickNext({ client, kinds: ["ISSUE_NFE", "POLL_NFE", "CANCEL_NFE"] });
  });
  if (!job) return { handled: false };

  try {
    if (job.kind === "ISSUE_NFE") {
      const payload = asIssuePayload(job.payload);
      const { invoiceId, focusRef } = payload;

      await withPgTx(pool, async (client) => {
        await invoiceRepo.setInternalStatus({ client, invoiceId, status: "ISSUING" });
      });

      const res = await focus.emitirNfe({ ref: focusRef, payload: payload.payload });
      let body = res.body as unknown;

      // If Focus reports that the ref was already processed, consult to recover status instead of failing.
      if (res.httpStatus === 422 && getString(body, "codigo") === "already_processed") {
        const consult = await focus.consultarNfe({ ref: focusRef, completa: 0 });
        body = consult.body as unknown;
      }

      await withPgTx(pool, async (client) => {
        await invoiceRepo.applyFocusResult({
          client,
          invoiceId,
          focusStatus: isRecord(body) ? (body.status as string | undefined) ?? null : null,
          sefazStatus: isRecord(body) ? (body.status_sefaz as string | undefined) ?? null : null,
          sefazMessage: isRecord(body) ? (body.mensagem_sefaz as string | undefined) ?? null : null,
          chaveAcesso: isRecord(body) ? (body.chave_nfe as string | undefined) ?? null : null,
        });
      });

      if (res.httpStatus === 202 || (isRecord(body) && body.status === "processando_autorizacao")) {
        const retryAt = new Date(Date.now() + 10_000);
        await withPgTx(pool, async (client) => {
          await jobRepo.enqueue({
            client,
            kind: "POLL_NFE",
            runAt: retryAt,
            payload: { invoiceId, focusRef, attempts: 0 },
            invoiceId,
          });
          await jobRepo.markDone({ client, jobId: job.id });
        });
        return { handled: true, jobId: job.id, kind: job.kind };
      }

      if (isRecord(body) && body.status === "autorizado") {
        let xml: string | null = null;
        const caminho =
          typeof body.caminho_xml_nota_fiscal === "string" ? body.caminho_xml_nota_fiscal : null;
        if (caminho) {
          const dl = await focus.baixarArquivo(caminho);
          if (dl.httpStatus >= 200 && dl.httpStatus < 300) xml = dl.body;
        }

        await withPgTx(pool, async (client) => {
          await invoiceRepo.applyFocusResult({
            client,
            invoiceId,
            xmlAuthorized: xml,
            protocoloAutorizacao: null,
          });
          await invoiceRepo.setInternalStatus({ client, invoiceId, status: "AUTHORIZED" });
          await jobRepo.markDone({ client, jobId: job.id });
        });
        return { handled: true, jobId: job.id, kind: job.kind };
      }

      await withPgTx(pool, async (client) => {
        await invoiceRepo.setInternalStatus({ client, invoiceId, status: "ERROR" });
        await jobRepo.markFailed({
          client,
          jobId: job.id,
          error: JSON.stringify({ httpStatus: res.httpStatus, body }).slice(0, 4000),
        });
      });
      return { handled: true, jobId: job.id, kind: job.kind };
    }

    if (job.kind === "POLL_NFE") {
      const payload = asPollPayload(job.payload);
      const { invoiceId, focusRef } = payload;
      const attempts = payload.attempts ?? 0;

      const res = await focus.consultarNfe({ ref: focusRef, completa: 0 });
      const body = res.body as unknown;

      await withPgTx(pool, async (client) => {
        await invoiceRepo.applyFocusResult({
          client,
          invoiceId,
          focusStatus: isRecord(body) ? (body.status as string | undefined) ?? null : null,
          sefazStatus: isRecord(body) ? (body.status_sefaz as string | undefined) ?? null : null,
          sefazMessage: isRecord(body) ? (body.mensagem_sefaz as string | undefined) ?? null : null,
          chaveAcesso: isRecord(body) ? (body.chave_nfe as string | undefined) ?? null : null,
        });
      });

      if (isRecord(body) && body.status === "autorizado") {
        let xml: string | null = null;
        const caminho =
          typeof body.caminho_xml_nota_fiscal === "string" ? body.caminho_xml_nota_fiscal : null;
        if (caminho) {
          const dl = await focus.baixarArquivo(caminho);
          if (dl.httpStatus >= 200 && dl.httpStatus < 300) xml = dl.body;
        }

        await withPgTx(pool, async (client) => {
          await invoiceRepo.applyFocusResult({ client, invoiceId, xmlAuthorized: xml });
          await invoiceRepo.setInternalStatus({ client, invoiceId, status: "AUTHORIZED" });
          await jobRepo.markDone({ client, jobId: job.id });
        });
        return { handled: true, jobId: job.id, kind: job.kind };
      }

      if (isRecord(body) && body.status === "processando_autorizacao") {
        const delayS = backoffSeconds(attempts + 1);
        const retryAt = new Date(Date.now() + delayS * 1000);
        await withPgTx(pool, async (client) => {
          await jobRepo.markFailed({
            client,
            jobId: job.id,
            error: "still_processing",
            retryAt,
          });
          await jobRepo.updatePayload({ client, jobId: job.id, payload: { ...payload, attempts: attempts + 1 } });
        });
        return { handled: true, jobId: job.id, kind: job.kind };
      }

      if (isRecord(body) && body.status === "rejeitado") {
        await withPgTx(pool, async (client) => {
          await invoiceRepo.setInternalStatus({ client, invoiceId, status: "REJECTED" });
          await jobRepo.markDone({ client, jobId: job.id });
        });
        return { handled: true, jobId: job.id, kind: job.kind };
      }

      if (isRecord(body) && body.status === "denegado") {
        await withPgTx(pool, async (client) => {
          await invoiceRepo.setInternalStatus({ client, invoiceId, status: "DENIED" });
          await jobRepo.markDone({ client, jobId: job.id });
        });
        return { handled: true, jobId: job.id, kind: job.kind };
      }

      await withPgTx(pool, async (client) => {
        await invoiceRepo.setInternalStatus({ client, invoiceId, status: "ERROR" });
        await jobRepo.markDone({ client, jobId: job.id });
      });
      return { handled: true, jobId: job.id, kind: job.kind };
    }

    if (job.kind === "CANCEL_NFE") {
      const payload = asCancelPayload(job.payload);
      const { invoiceId, focusRef, justificativa } = payload;

      // Perform cancel request
      const res = await focus.cancelarNfe({ ref: focusRef, justificativa });
      const body = res.body as unknown;

      // If Focus/SEFAZ is temporarily unavailable, retry later.
      if (
        res.httpStatus >= 500 ||
        (isRecord(body) &&
          typeof body.mensagem === "string" &&
          (body.mensagem.includes("conex") || body.mensagem.includes("SEFAZ")))
      ) {
        const attempts = job.attempts ?? 0;
        const delayS = backoffSeconds(attempts);
        const retryAt = new Date(Date.now() + delayS * 1000);
        await withPgTx(pool, async (client) => {
          await eventRepo.append({
            client,
            invoiceId,
            type: "CANCEL_RETRY",
            payload: { httpStatus: res.httpStatus, body, justificativa },
          });
          await jobRepo.markFailed({ client, jobId: job.id, error: "cancel_temp_error", retryAt });
        });
        return { handled: true, jobId: job.id, kind: job.kind };
      }

      // Always consult after cancel to persist final status
      const consult = await focus.consultarNfe({ ref: focusRef, completa: 1 });
      const b2 = consult.body as unknown;

      await withPgTx(pool, async (client) => {
        await invoiceRepo.applyFocusResult({
          client,
          invoiceId,
          focusStatus: isRecord(b2) ? (b2.status as string | undefined) ?? null : null,
          sefazStatus: isRecord(b2) ? (b2.status_sefaz as string | undefined) ?? null : null,
          sefazMessage: isRecord(b2) ? (b2.mensagem_sefaz as string | undefined) ?? null : null,
          chaveAcesso: isRecord(b2) ? (b2.chave_nfe as string | undefined) ?? null : null,
        });

        await eventRepo.append({
          client,
          invoiceId,
          type: "CANCEL_REQUEST",
          payload: { justificativa, httpStatus: res.httpStatus, body },
        });

        const finalStatus = isRecord(b2) && b2.status === "cancelado" ? "CANCELED" : "ERROR";
        await invoiceRepo.setInternalStatus({ client, invoiceId, status: finalStatus });
        await jobRepo.markDone({ client, jobId: job.id });
      });

      return { handled: true, jobId: job.id, kind: job.kind };
    }

    await withPgTx(pool, async (client) => {
      await jobRepo.markFailed({ client, jobId: job.id, error: `Unknown job kind: ${job.kind}` });
    });
    return { handled: true, jobId: job.id, kind: job.kind };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const attempts = job.attempts ?? 0;
    const delayS = backoffSeconds(attempts);
    const retryAt = new Date(Date.now() + delayS * 1000);
    await withPgTx(pool, async (client) => {
      await jobRepo.markFailed({ client, jobId: job.id, error: msg, retryAt });
    });
    return { handled: true, jobId: job.id, kind: job.kind };
  }
}

export async function processFiscalJobsOnce(limit = 5): Promise<{ handled: number }> {
  let handled = 0;
  for (let i = 0; i < limit; i++) {
    const res = await processNextFiscalJob();
    if (!res.handled) break;
    handled++;
  }
  return { handled };
}
