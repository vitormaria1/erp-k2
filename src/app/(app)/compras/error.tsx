"use client";

type ComprasErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ComprasError(props: ComprasErrorProps) {
  console.error("compras route error", props.error);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="rounded-3xl border bg-[var(--card)] p-8 shadow-sm">
        <div className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Compras</div>
        <h1 className="mt-3 text-2xl font-semibold">Nao foi possivel abrir esta pagina agora.</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Tivemos um problema ao carregar os dados das notas de entrada. Tente novamente em instantes. Se persistir,
          o erro foi registrado para analise.
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
