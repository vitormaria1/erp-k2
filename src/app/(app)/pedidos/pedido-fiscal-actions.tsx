"use client";

import { useId, useState } from "react";

import { PEDIDO_FISCAL_OPERATION_OPTIONS, type PedidoFiscalOperationCode } from "@/fiscal/config/operation_options";

import { IssueInvoiceButton } from "./issue-invoice-button";

export function PedidoFiscalActions(props: {
  orderId: number;
  disabled: boolean;
  title: string;
  label: string;
  defaultOperationCode: PedidoFiscalOperationCode;
}) {
  const selectId = useId();
  const [fiscalOperationCode, setFiscalOperationCode] = useState<PedidoFiscalOperationCode>(props.defaultOperationCode);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <form action="/api/fiscal/orders/preview-danfe" method="post">
          <input type="hidden" name="orderId" value={props.orderId} />
          <input type="hidden" name="fiscalOperationCode" value={fiscalOperationCode} />
          <button className="rounded-lg border px-3 py-1.5 text-xs font-semibold">Preview DANFE</button>
        </form>
        <IssueInvoiceButton
          orderId={props.orderId}
          disabled={props.disabled}
          title={props.title}
          label={props.label}
          fiscalOperationCode={fiscalOperationCode}
        />
      </div>
      <label htmlFor={selectId} className="flex max-w-[280px] flex-col gap-1 text-[11px] text-[var(--muted)]">
        <span className="font-semibold uppercase tracking-wide">Operacao fiscal</span>
        <select
          id={selectId}
          value={fiscalOperationCode}
          onChange={(event) => setFiscalOperationCode(event.target.value as PedidoFiscalOperationCode)}
          className="rounded-lg border bg-[var(--card)] px-3 py-2 text-xs font-semibold text-black"
        >
          {PEDIDO_FISCAL_OPERATION_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label} • {option.description}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
