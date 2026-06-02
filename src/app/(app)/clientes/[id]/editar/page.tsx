import Link from "next/link";
import { notFound } from "next/navigation";

import { getCustomerById } from "@/lib/queries";
import { updateCustomerAction } from "../../actions";
import { CustomerForm } from "../../customer-form";

export default async function EditarClientePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const customer = getCustomerById(id);
  if (!customer) notFound();

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-sm text-[var(--muted)]">Clientes</div>
          <h1 className="text-2xl font-semibold">Editar cliente</h1>
          <div className="mt-1 text-sm text-[var(--muted)]">
            Atualize cadastro, endereço e contato do cliente {customer.code}.
          </div>
        </div>
        <Link href="/clientes" className="rounded-xl border bg-[var(--card)] px-4 py-3 text-sm font-semibold">
          Voltar
        </Link>
      </div>

      <CustomerForm action={updateCustomerAction} customer={customer} submitLabel="Atualizar cliente" />
    </div>
  );
}
