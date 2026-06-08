"use client";

type FinanceiroErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function FinanceiroError(props: FinanceiroErrorProps) {
  console.error("financeiro route error", props.error);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="rounded-3xl border bg-[var(--card)] p-8 shadow-sm">
        <div className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Financeiro</div>
        <h1 className="mt-3 text-2xl font-semibold">Nao foi possivel carregar esta pagina agora.</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Ocorreu um problema ao buscar os dados do financeiro. Tente recarregar a pagina. Se isso continuar, o erro foi
          registrado para correcao.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={props.reset}
            className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
          >
            Tentar novamente
          </button>
          <a href="/dashboard" className="rounded-xl border px-4 py-3 text-sm font-semibold">
            Voltar ao painel
          </a>
        </div>
      </div>
    </div>
  );
}
