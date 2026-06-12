"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type InvoiceStatusResponse = {
  id: string;
  internal_status?: string | null;
  serie?: string | null;
  numero?: number | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      :root { color-scheme: light; }
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
      h1 { margin: 18px 0 0; font-size: 22px; }
      p { margin: 10px 0 0; color: #6c625b; font-size: 14px; line-height: 1.45; }
      @keyframes spin { to { transform: rotate(360deg); } }
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

export function IssueInvoiceButton(props: {
  orderId: number;
  disabled: boolean;
  title: string;
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;
    return () => {
      stoppedRef.current = true;
    };
  }, []);

  async function waitForDanfe(invoiceId: string, redirectTo: string, postAuthorizedRedirectTo?: string) {
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
          } else if (!postAuthorizedRedirectTo) {
            router.push(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}autoprint=1`);
          }

          if (postAuthorizedRedirectTo) {
            router.refresh();
            setError("NF autorizada. Gere o boleto na coluna de cobranca deste pedido.");
          } else {
            setError(null);
          }
          return;
        }

        if (status === "TEMP_ERROR") {
          if (popupRef.current && !popupRef.current.closed) {
            popupRef.current.location.href = redirectTo;
          } else {
            router.push(redirectTo);
          }
          throw new Error("Instabilidade temporária detectada. O ERP continuará tentando automaticamente; acompanhe pela tela de Nota Fiscal.");
        }

        if (status && ["REJECTED", "DENIED", "ERROR", "CANCELED"].includes(status)) {
          throw new Error(`A emissão fiscal terminou com status ${status}.`);
        }
      } catch (pollError) {
        if (
          pollError instanceof Error &&
          (/terminou com status/i.test(pollError.message) || /Instabilidade tempor/i.test(pollError.message))
        ) {
          throw pollError;
        }
      }

      await sleep(2000);
    }

    throw new Error("A NF ainda não autorizou dentro do tempo esperado. Você pode acompanhar pela tela de Nota Fiscal.");
  }

  function handleClick() {
    setError(null);
    popupRef.current = openDanfeTargetWindow();
    const formData = new FormData();
    formData.set("orderId", String(props.orderId));

    startTransition(async () => {
      try {
        const res = await fetch("/api/fiscal/orders/issue", {
          method: "POST",
          headers: { accept: "application/json" },
          body: formData,
        });
        const payload = (await res.json().catch(() => null)) as
          | { redirectTo?: string; postAuthorizedRedirectTo?: string; error?: string; duplicate?: boolean; invoiceId?: string }
          | null;

        if (res.status === 409 && payload?.redirectTo) {
          if (popupRef.current && !popupRef.current.closed) {
            popupRef.current.location.href = payload.redirectTo;
          } else {
            router.push(payload.redirectTo);
          }
          setError(payload.error ?? "Este pedido já possui NF vinculada");
          return;
        }

        if (!res.ok) {
          throw new Error(payload?.error ?? "Falha ao emitir NF-e");
        }
        if (!payload?.redirectTo || !payload.invoiceId) {
          throw new Error("Resposta inválida da emissão");
        }

        void waitForDanfe(payload.invoiceId, payload.redirectTo, payload.postAuthorizedRedirectTo).catch((pollError) => {
          if (popupRef.current && !popupRef.current.closed) {
            popupRef.current.close();
          }
          const msg = pollError instanceof Error ? pollError.message : String(pollError);
          setError(msg);
        });
      } catch (e) {
        if (popupRef.current && !popupRef.current.closed) {
          popupRef.current.close();
        }
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={props.disabled || isPending}
        title={props.title}
        className="rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Emitindo..." : props.label}
      </button>
      {error ? <div className="max-w-[240px] text-[11px] text-red-700">{error}</div> : null}
    </div>
  );
}
