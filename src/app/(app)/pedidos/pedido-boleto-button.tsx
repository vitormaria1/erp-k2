"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { gerarPedidoBoletoStateAction, type PedidoBoletoActionState } from "./actions";

type Props = {
  receivableId: string;
};

const initialState: PedidoBoletoActionState = {
  ok: false,
  error: null,
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button disabled={pending} className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
      {pending ? "Gerando..." : "Gerar boleto"}
    </button>
  );
}

export function PedidoBoletoButton({ receivableId }: Props) {
  const [state, formAction] = useActionState(gerarPedidoBoletoStateAction, initialState);

  return (
    <form action={formAction} className="mt-3">
      <input type="hidden" name="receivableId" value={receivableId} />
      <SubmitButton />
      {state.error ? <div className="mt-2 max-w-[240px] text-[11px] text-red-700">{state.error}</div> : null}
      {state.ok ? <div className="mt-2 text-[11px] text-emerald-700">Boleto gerado. Atualize ou reabra o pedido.</div> : null}
    </form>
  );
}
