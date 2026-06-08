"use client";

import * as React from "react";

import {
  BOLETO_DUE_SHORTCUT_DAYS,
  getRelativeDueDateInputValue,
  type OrderPaymentMethod,
} from "@/lib/payments";

type Props = {
  formId: string;
};

const DEFAULT_PAYMENT_METHOD: OrderPaymentMethod = "PIX";

export function PaymentFieldsClient({ formId }: Props) {
  const [paymentMethod, setPaymentMethod] = React.useState<OrderPaymentMethod>(DEFAULT_PAYMENT_METHOD);
  const [dueDate, setDueDate] = React.useState(getRelativeDueDateInputValue(7));
  const [installments, setInstallments] = React.useState("1");

  React.useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;

    const handleReset = () => {
      setPaymentMethod(DEFAULT_PAYMENT_METHOD);
      setDueDate(getRelativeDueDateInputValue(7));
      setInstallments("1");
    };

    form.addEventListener("reset", handleReset);
    return () => form.removeEventListener("reset", handleReset);
  }, [formId]);

  return (
    <>
      <label className="space-y-1">
        <div className="text-sm font-semibold">Recebimento</div>
        <select
          name="paymentMethod"
          value={paymentMethod}
          onChange={(event) => setPaymentMethod(event.target.value as OrderPaymentMethod)}
          className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
        >
          <option value="PIX">Pix</option>
          <option value="CASH">Dinheiro</option>
          <option value="BOLETO">Boleto</option>
        </select>
      </label>

      {paymentMethod === "BOLETO" ? (
        <>
          <label className="space-y-1">
            <div className="text-sm font-semibold">Parcelas</div>
            <select
              name="installments"
              value={installments}
              onChange={(event) => setInstallments(event.target.value)}
              className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
            >
              {Array.from({ length: 12 }, (_value, index) => (
                <option key={index + 1} value={index + 1}>
                  {index + 1}x
                </option>
              ))}
            </select>
            <div className="text-xs text-[var(--muted)]">As parcelas seguintes vencem a cada 7 dias.</div>
          </label>

          <div className="space-y-2">
            <div className="text-sm font-semibold">Primeiro vencimento</div>
            <div className="flex flex-wrap gap-2">
              {BOLETO_DUE_SHORTCUT_DAYS.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setDueDate(getRelativeDueDateInputValue(days))}
                  className="rounded-xl border px-3 py-2 text-sm font-semibold"
                >
                  +{days} dias
                </button>
              ))}
            </div>
            <input
              name="dueDate"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm"
            />
          </div>
        </>
      ) : (
        <input type="hidden" name="installments" value="1" />
      )}
    </>
  );
}
