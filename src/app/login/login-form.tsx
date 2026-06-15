"use client";

import Image from "next/image";
import { useActionState } from "react";

import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {
  error: null,
};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-black/8 bg-white p-8 text-[var(--foreground)] shadow-[0_28px_90px_rgba(0,0,0,0.12)] sm:p-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,179,1,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(224,0,0,0.12),transparent_30%)]" />
      <div className="relative">
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 overflow-hidden rounded-2xl ring-1 ring-black/8 sm:h-24 sm:w-24">
            <Image src="/k2-logo.jpeg" alt="K2 Salgados" fill className="object-cover" priority />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--k2-gold)]">
              K2 Salgados
            </div>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">Acesso ao ERP</h1>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-black/8 bg-black/[0.02] p-4 text-base text-[var(--muted)]">
          Controle operacional, fiscal e produção em um único painel.
        </div>

        <form action={formAction} className="mt-8 space-y-5">
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Usuário</span>
            <input
              name="username"
              defaultValue="admin"
              autoComplete="username"
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-4 text-base outline-none transition placeholder:text-black/30 focus:border-[var(--k2-gold)]"
              placeholder="Digite seu usuário"
              required
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Senha</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-4 text-base outline-none transition placeholder:text-black/30 focus:border-[var(--k2-gold)]"
              placeholder="Digite sua senha"
              required
            />
          </label>

          {state.error ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-700">
              {state.error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="inline-flex w-full cursor-pointer items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#f5b301_0%,#e00000_100%)] px-5 py-4 text-base font-semibold text-white shadow-[0_18px_42px_rgba(224,0,0,0.28)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Entrando..." : "Entrar no painel"}
          </button>
        </form>
      </div>
    </div>
  );
}
