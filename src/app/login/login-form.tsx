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
    <div className="relative overflow-hidden rounded-[32px] border border-white/12 bg-[#121212]/88 p-8 text-white shadow-[0_28px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,179,1,0.22),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(224,0,0,0.18),transparent_30%)]" />
      <div className="relative">
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 overflow-hidden rounded-2xl ring-1 ring-white/20 sm:h-24 sm:w-24">
            <Image src="/k2-logo.jpeg" alt="K2 Salgados" fill className="object-cover" priority />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--k2-gold)]">
              K2 Salgados
            </div>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">Acesso ao ERP</h1>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 text-base text-white/72">
          Controle operacional, fiscal e produção em um único painel.
        </div>

        <form action={formAction} className="mt-8 space-y-5">
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Usuário</span>
            <input
              name="username"
              defaultValue="admin"
              autoComplete="username"
              className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-4 text-base outline-none transition placeholder:text-white/32 focus:border-[var(--k2-gold)] focus:bg-white/12"
              placeholder="Digite seu usuário"
              required
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Senha</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-4 text-base outline-none transition placeholder:text-white/32 focus:border-[var(--k2-gold)] focus:bg-white/12"
              placeholder="Digite sua senha"
              required
            />
          </label>

          {state.error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/12 px-4 py-3 text-sm text-red-100">
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
