"use client";

import { useEffect, useRef, useState, useTransition } from "react";

type Props = {
  formId: string;
};

type IssueResponse = {
  ok: boolean;
  orderId?: number;
  orderPrintUrl?: string;
  invoiceId?: string;
  redirectTo?: string;
  duplicate?: boolean;
  error?: string;
};

type CreateOrderResponse = {
  ok: boolean;
  orderId?: number;
  orderPrintUrl?: string;
  error?: string;
};

type InvoiceStatusResponse = {
  id: string;
  internal_status?: string | null;
  serie?: string | null;
  numero?: number | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function EmitInvoiceSubmitClient({ formId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{
    tone: "idle" | "loading" | "success" | "error";
    text: string;
    orderPrintUrl?: string;
    danfeUrl?: string;
  }>({
    tone: "idle",
    text: "",
  });
  const popupRef = useRef<Window | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;
    return () => {
      stoppedRef.current = true;
    };
  }, []);

  function openDanfeTargetWindow() {
    const popup = window.open("", "_blank");
    if (!popup) return null;

    popup.document.write(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Preparando DANFE</title>
    <style>
      :root {
        color-scheme: light;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top, rgba(186, 40, 40, 0.12), transparent 32%),
          linear-gradient(180deg, #f7f2ec 0%, #efe7de 100%);
        color: #231815;
        font-family: Arial, sans-serif;
      }
      .card {
        width: min(92vw, 460px);
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.12);
        padding: 32px 28px;
        text-align: center;
      }
      .spinner {
        width: 52px;
        height: 52px;
        margin: 0 auto;
        border-radius: 999px;
        border: 4px solid rgba(186, 40, 40, 0.18);
        border-top-color: #ba2828;
        animation: spin 0.9s linear infinite;
      }
      h1 {
        margin: 18px 0 0;
        font-size: 22px;
      }
      p {
        margin: 10px 0 0;
        color: #6c625b;
        font-size: 14px;
        line-height: 1.45;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="spinner"></div>
      <h1>Preparando DANFE</h1>
      <p>A nota est&aacute; sendo emitida. Esta guia ser&aacute; atualizada automaticamente quando a DANFE estiver pronta.</p>
    </div>
  </body>
</html>`);
    popup.document.close();
    return popup;
  }

  async function waitForDanfe(invoiceId: string) {
    const finalDanfeUrl = `/api/fiscal/invoices/${encodeURIComponent(invoiceId)}/danfe`;
    const maxAttempts = 30;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (stoppedRef.current) return;

      try {
        await fetch("/api/fiscal/worker/tick", { method: "POST" }).catch(() => null);
        const res = await fetch(`/api/fiscal/invoices/${encodeURIComponent(invoiceId)}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await res.json().catch(() => null)) as InvoiceStatusResponse | null;
        const status = payload?.internal_status ?? null;

        if (status === "AUTHORIZED") {
          if (popupRef.current && !popupRef.current.closed) {
            popupRef.current.location.href = finalDanfeUrl;
          }
          setNotice((prev) => ({
            tone: popupRef.current && !popupRef.current.closed ? "success" : "error",
            text:
              popupRef.current && !popupRef.current.closed
                ? "NF autorizada. A DANFE foi aberta na outra guia."
                : "NF autorizada. A guia foi fechada; clique abaixo para abrir a DANFE.",
            orderPrintUrl: prev.orderPrintUrl,
            danfeUrl: finalDanfeUrl,
          }));
          return;
        }

        if (status && ["REJECTED", "DENIED", "ERROR", "CANCELED"].includes(status)) {
          setNotice((prev) => ({
            tone: "error",
            text: `A emissão fiscal terminou com status ${status}. Abra a tela de Nota Fiscal para verificar o detalhe.`,
            orderPrintUrl: prev.orderPrintUrl,
            danfeUrl: undefined,
          }));
          return;
        }
      } catch {
        // ignore transient polling errors
      }

      await sleep(2000);
    }

    setNotice((prev) => ({
      tone: "error",
      text: "A NF ainda não autorizou dentro do tempo esperado. Você pode acompanhar pela tela de Nota Fiscal.",
      orderPrintUrl: prev.orderPrintUrl,
      danfeUrl: undefined,
    }));
  }

  function handleClick() {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    if (!form.reportValidity()) return;

    popupRef.current = openDanfeTargetWindow();
    setNotice({
      tone: "loading",
      text: "Criando pedido e emitindo NF. A outra guia mostrará o andamento até liberar a DANFE.",
    });

    startTransition(async () => {
      try {
        const formData = new FormData(form);
        const res = await fetch("/api/orders/create-and-issue", {
          method: "POST",
          headers: { accept: "application/json" },
          body: formData,
        });

        const payload = (await res.json().catch(() => null)) as IssueResponse | null;
        if (!payload) {
          throw new Error("Resposta inválida ao criar pedido e emitir NF.");
        }

        if (res.ok) {
          setNotice({
            tone: "success",
            text: `Pedido #${payload.orderId ?? "-"} criado. A NF está sendo processada.`,
            orderPrintUrl: payload.orderPrintUrl,
            danfeUrl: undefined,
          });
          if (payload.invoiceId) {
            setNotice({
              tone: "loading",
              text: `Pedido #${payload.orderId ?? "-"} criado. Aguardando autorização da NF para abrir a DANFE...`,
              orderPrintUrl: payload.orderPrintUrl,
              danfeUrl: undefined,
            });
            void waitForDanfe(payload.invoiceId);
          }
          return;
        }

        if (res.status === 409) {
          setNotice({
            tone: "error",
            text: payload.error ?? "Este pedido já possui NF vinculada.",
            orderPrintUrl: payload.orderPrintUrl,
            danfeUrl: undefined,
          });
          return;
        }

        setNotice({
          tone: "error",
          text: payload.error ?? "Falha ao criar pedido e emitir NF.",
          orderPrintUrl: payload.orderPrintUrl,
          danfeUrl: undefined,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        setNotice({ tone: "error", text: msg });
      }
    });
  }

  function handleCreateOrderClick() {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    if (!form.reportValidity()) return;

    const popup = window.open("", "_blank");
    setNotice({
      tone: "loading",
      text: "Criando pedido e abrindo a impressão em outra guia.",
    });

    startTransition(async () => {
      try {
        const formData = new FormData(form);
        const res = await fetch("/api/orders/create", {
          method: "POST",
          headers: { accept: "application/json" },
          body: formData,
        });

        const payload = (await res.json().catch(() => null)) as CreateOrderResponse | null;
        if (!payload) {
          throw new Error("Resposta inválida ao criar pedido.");
        }

        if (!res.ok || !payload.ok || !payload.orderPrintUrl) {
          if (popup && !popup.closed) popup.close();
          setNotice({
            tone: "error",
            text: payload.error ?? "Falha ao criar pedido.",
          });
          return;
        }

        if (popup && !popup.closed) {
          popup.location.href = payload.orderPrintUrl;
        } else {
          window.open(payload.orderPrintUrl, "_blank", "noopener,noreferrer");
        }

        setNotice({
          tone: "success",
          text: `Pedido #${payload.orderId ?? "-"} criado. A impressão foi aberta em outra guia.`,
          orderPrintUrl: payload.orderPrintUrl,
        });
      } catch (error) {
        if (popup && !popup.closed) popup.close();
        const msg = error instanceof Error ? error.message : String(error);
        setNotice({ tone: "error", text: msg });
      }
    });
  }

  const toneClass =
    notice.tone === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : notice.tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <button
        type="button"
        onClick={handleCreateOrderClick}
        disabled={isPending}
        className="cursor-pointer rounded-xl border px-5 py-3 text-sm font-semibold"
      >
        Criar pedido
      </button>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="cursor-pointer rounded-xl bg-[var(--k2-red-2)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Emitindo NF..." : "Emitir NF"}
      </button>
      {notice.tone === "loading" ? (
        <div className="sm:max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <div>{notice.text}</div>
          </div>
          {notice.orderPrintUrl ? (
            <a className="mt-2 inline-block font-semibold underline" href={notice.orderPrintUrl} target="_blank" rel="noreferrer">
              Abrir impressão do pedido
            </a>
          ) : null}
        </div>
      ) : null}
      {notice.tone !== "idle" && notice.tone !== "loading" ? (
        <div className={`sm:max-w-md rounded-xl border px-4 py-3 text-sm ${toneClass}`}>
          <div>{notice.text}</div>
          {notice.orderPrintUrl ? (
            <a className="mt-2 inline-block font-semibold underline" href={notice.orderPrintUrl} target="_blank" rel="noreferrer">
              Abrir impressão do pedido
            </a>
          ) : null}
          {notice.danfeUrl ? (
            <button
              type="button"
              className="mt-2 block cursor-pointer font-semibold underline"
              onClick={() => window.open(notice.danfeUrl, "_blank", "noopener,noreferrer")}
            >
              Abrir DANFE
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
