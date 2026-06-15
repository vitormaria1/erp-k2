"use client";

import * as React from "react";

import {
  BONIFICACAO_PAYMENT_METHOD,
  BOLETO_DUE_SHORTCUT_DAYS,
  getRelativeDueDateInputValue,
  type OrderPaymentMethod,
} from "@/lib/payments";
import { FISCAL_OPERATION_CODE_BONIFICACAO_5910 } from "@/fiscal/config/operation_options";

type Props = {
  formId: string;
  initialPaymentMethod?: OrderPaymentMethod;
  initialDueDate?: string;
  initialInstallments?: number;
};

const DEFAULT_PAYMENT_METHOD: OrderPaymentMethod = "PIX";

export function PaymentFieldsClient({
  formId,
  initialPaymentMethod = DEFAULT_PAYMENT_METHOD,
  initialDueDate = getRelativeDueDateInputValue(7),
  initialInstallments = 1,
}: Props) {
  const [paymentMethod, setPaymentMethod] = React.useState<OrderPaymentMethod>(initialPaymentMethod);
  const [dueDate, setDueDate] = React.useState(initialDueDate);
  const [installments, setInstallments] = React.useState(String(initialInstallments));
  const [isBonificacaoMode, setIsBonificacaoMode] = React.useState(
    initialPaymentMethod === BONIFICACAO_PAYMENT_METHOD
  );

  React.useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;

    const syncFiscalOperation = () => {
      const input = form.elements.namedItem("fiscalOperationCode");
      const isBonificacao =
        input instanceof HTMLSelectElement || input instanceof HTMLInputElement
          ? input.value === FISCAL_OPERATION_CODE_BONIFICACAO_5910
          : false;
      setIsBonificacaoMode(initialPaymentMethod === BONIFICACAO_PAYMENT_METHOD || isBonificacao);
    };

    const handleReset = () => {
      setPaymentMethod(initialPaymentMethod);
      setDueDate(initialDueDate);
      setInstallments(String(initialInstallments));
      setIsBonificacaoMode(initialPaymentMethod === BONIFICACAO_PAYMENT_METHOD);
    };

    syncFiscalOperation();
    form.addEventListener("input", syncFiscalOperation);
    form.addEventListener("change", syncFiscalOperation);
    form.addEventListener("reset", handleReset);
    return () => {
      form.removeEventListener("input", syncFiscalOperation);
      form.removeEventListener("change", syncFiscalOperation);
      form.removeEventListener("reset", handleReset);
    };
  }, [formId, initialDueDate, initialInstallments, initialPaymentMethod]);

  if (isBonificacaoMode) {
    return (
      <>
        <input type="hidden" name="paymentMethod" value={BONIFICACAO_PAYMENT_METHOD} />
        <input type="hidden" name="installments" value="1" />
        <label className="space-y-1">
          <div className="text-sm font-semibold">Recebimento</div>
          <div className="rounded-xl border bg-black/[0.03] px-4 py-3 text-sm font-semibold">
            BONIFICACAO
          </div>
          <div className="text-xs text-[var(--muted)]">
            Pedidos de bonificação não geram recebíveis nem boleto no financeiro.
          </div>
        </label>
      </>
    );
  }

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
