"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function IssueInvoiceButton(props: {
  orderId: number;
  disabled: boolean;
  title: string;
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    const printWindow =
      typeof window !== "undefined" ? window.open("/nota-fiscal?emitindo=1", "_blank") : null;
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
          | { redirectTo?: string; error?: string; duplicate?: boolean }
          | null;
        if (res.status === 409 && payload?.redirectTo) {
          if (printWindow && !printWindow.closed) {
            printWindow.location.href = payload.redirectTo;
          } else {
            router.push(payload.redirectTo);
          }
          setError(payload.error ?? "Este pedido já possui NF vinculada");
          return;
        }
        if (!res.ok) {
          throw new Error(payload?.error ?? "Falha ao emitir NF-e");
        }
        if (!payload?.redirectTo) {
          throw new Error("Resposta inválida da emissão");
        }
        const printRedirectTo = `${payload.redirectTo}${payload.redirectTo.includes("?") ? "&" : "?"}autoprint=1`;

        if (printWindow && !printWindow.closed) {
          printWindow.location.href = printRedirectTo;
        } else {
          router.push(printRedirectTo);
        }
      } catch (e) {
        if (printWindow && !printWindow.closed) {
          printWindow.close();
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
