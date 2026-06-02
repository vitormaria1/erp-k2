import Link from "next/link";

import type { CustomerRow } from "@/lib/queries";

type CustomerFormProps = {
  action: (formData: FormData) => Promise<void>;
  customer?: CustomerRow;
  submitLabel: string;
};

type Field = {
  name: keyof CustomerRow;
  label: string;
  required?: boolean;
  placeholder?: string;
};

const registrationFields: Field[] = [
  { name: "code", label: "Código", required: true },
  { name: "name", label: "Nome / Razão social", required: true },
  { name: "tradeName", label: "Nome fantasia" },
  { name: "cnpj", label: "CPF/CNPJ" },
  { name: "stateTaxId", label: "Inscrição estadual" },
  { name: "cep", label: "CEP" },
];

const addressFields: Field[] = [
  { name: "street", label: "Endereço / Logradouro" },
  { name: "number", label: "Número" },
  { name: "complement", label: "Complemento" },
  { name: "neighborhood", label: "Bairro" },
  { name: "city", label: "Cidade" },
  { name: "uf", label: "UF" },
  { name: "cityCode", label: "Código município" },
  { name: "country", label: "País" },
  { name: "countryCode", label: "Código país" },
];

const contactFields: Field[] = [
  { name: "phone", label: "Telefone" },
  { name: "email", label: "E-mail" },
  { name: "homePage", label: "Home page" },
];

const controlFields: Field[] = [
  { name: "registeredAt", label: "Data cadastro" },
  { name: "lastUpdatedAt", label: "Última atualização" },
  { name: "blockReason", label: "Motivo bloqueio" },
  { name: "customerTypeCode", label: "Cód. tipo cadastro" },
];

function TextField({ field, customer }: { field: Field; customer?: CustomerRow }) {
  const value = customer?.[field.name];
  return (
    <label className="block space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {field.label}
        {field.required ? <span className="text-[var(--k2-red-2)]"> *</span> : null}
      </div>
      <input
        name={field.name}
        defaultValue={typeof value === "string" ? value : ""}
        required={field.required}
        placeholder={field.placeholder}
        className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-black/40"
      />
    </label>
  );
}

function Fieldset({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-black/[0.02] p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">{children}</div>
    </section>
  );
}

export function CustomerForm({ action, customer, submitLabel }: CustomerFormProps) {
  return (
    <form action={action} className="mt-6 space-y-4 rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}

      <Fieldset title="Cadastro">
        {registrationFields.map((field) => (
          <TextField key={field.name} field={field} customer={customer} />
        ))}
        <label className="flex items-center gap-3 rounded-xl border bg-[var(--card)] px-4 py-3 text-sm md:mt-6">
          <input
            name="taxpayer"
            type="checkbox"
            defaultChecked={Boolean(customer?.taxpayer)}
            className="h-4 w-4"
          />
          <span>Contribuinte</span>
        </label>
      </Fieldset>

      <Fieldset title="Endereço">
        {addressFields.map((field) => (
          <TextField key={field.name} field={field} customer={customer} />
        ))}
      </Fieldset>

      <Fieldset title="Contato">
        {contactFields.map((field) => (
          <TextField key={field.name} field={field} customer={customer} />
        ))}
      </Fieldset>

      <Fieldset title="Controle do cadastro">
        {controlFields.map((field) => (
          <TextField key={field.name} field={field} customer={customer} />
        ))}
        <label className="flex items-center gap-3 rounded-xl border bg-[var(--card)] px-4 py-3 text-sm md:mt-6">
          <input
            name="tracksOrders"
            type="checkbox"
            defaultChecked={Boolean(customer?.tracksOrders)}
            className="h-4 w-4"
          />
          <span>Acompanha pedidos</span>
        </label>
        <label className="flex items-center gap-3 rounded-xl border bg-[var(--card)] px-4 py-3 text-sm md:mt-6">
          <input
            name="blocked"
            type="checkbox"
            defaultChecked={Boolean(customer?.blocked)}
            className="h-4 w-4"
          />
          <span>Bloqueado</span>
        </label>
      </Fieldset>

      <div className="flex flex-wrap gap-2">
        <button className="rounded-xl bg-[var(--k2-red-2)] px-5 py-3 text-sm font-semibold text-white">
          {submitLabel}
        </button>
        <Link href="/clientes" className="rounded-xl border bg-[var(--card)] px-5 py-3 text-sm font-semibold">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
