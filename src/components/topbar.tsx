import Link from "next/link";
import Image from "next/image";

export function Topbar() {
  const today = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());
  return (
    <header className="flex items-center justify-between gap-4 p-6">
      <div>
        <div className="text-sm text-[var(--muted)]">Olá, Vítor!</div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <div className="text-sm text-[var(--muted)]">Visão geral da sua fábrica.</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-xl border bg-[var(--card)] px-3 py-2 md:flex">
          <div className="relative h-8 w-8 overflow-hidden rounded-full bg-white">
            <Image src="/k2-logo.jpeg" alt="K2 Salgados" fill className="object-cover" />
          </div>
          <div className="text-sm font-semibold">K2</div>
        </div>
        <div className="hidden items-center gap-2 rounded-xl border bg-[var(--card)] px-4 py-3 text-sm text-[var(--muted)] md:flex">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--k2-gold)]" />
          {today}
        </div>
        <Link
          href="/pedidos/novo"
          className="rounded-xl bg-[var(--k2-red-2)] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-95"
        >
          + Novo pedido
        </Link>
      </div>
    </header>
  );
}
