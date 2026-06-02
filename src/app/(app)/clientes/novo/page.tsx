import Link from "next/link";

import { createCustomerAction } from "../actions";
import { CustomerForm } from "../customer-form";

export default function NovoClientePage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-sm text-[var(--muted)]">Clientes</div>
          <h1 className="text-2xl font-semibold">Novo cliente</h1>
          <div className="mt-1 text-sm text-[var(--muted)]">
            Preencha os mesmos campos usados na importação do cadastro.
          </div>
        </div>
        <Link href="/clientes" className="rounded-xl border bg-[var(--card)] px-4 py-3 text-sm font-semibold">
          Voltar
        </Link>
      </div>

      <CustomerForm action={createCustomerAction} submitLabel="Salvar cliente" />
    </div>
  );
}
