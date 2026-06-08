"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { financeUnlockAction, type FinanceUnlockState } from "./actions";

const initialState: FinanceUnlockState = {
  error: null,
  unlocked: false,
};

export function FinanceUnlockForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(financeUnlockAction, initialState);

  useEffect(() => {
    if (!state.unlocked) return;
    router.refresh();
  }, [router, state.unlocked]);

  return (
    <div className="mx-auto mt-16 max-w-md rounded-[28px] border bg-[var(--card)] p-8 shadow-sm">
      <div className="text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Financeiro</div>
        <h1 className="mt-2 text-3xl font-semibold">PIN de acesso</h1>
        <div className="mt-3 text-sm text-[var(--muted)]">
          Esta area exige confirmacao adicional antes de exibir recebimentos, contas e caixa.
        </div>
      </div>

      <form action={formAction} className="mt-8 space-y-5">
        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">PIN</span>
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            autoFocus
            className="w-full rounded-2xl border bg-[var(--card)] px-4 py-4 text-center text-2xl tracking-[0.4em] outline-none transition focus:border-[var(--k2-red-2)]"
            placeholder="...."
            required
          />
        </label>

        {state.error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {state.error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full cursor-pointer items-center justify-center rounded-2xl bg-black px-5 py-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Validando..." : "Entrar no financeiro"}
        </button>
      </form>
    </div>
  );
}
