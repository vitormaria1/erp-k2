import { listCustomers } from "@/lib/queries";

export default async function ClientesPage(props: { searchParams?: Promise<{ q?: string }> }) {
  const sp = (await props.searchParams) ?? {};
  const q = sp.q ?? "";
  const rows = listCustomers({ q, limit: 100 });

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <div className="text-sm text-[var(--muted)]">Cadastro importado do PDF.</div>
        </div>
        <form className="flex gap-2" action="/clientes" method="GET">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome, CNPJ, código..."
            className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm outline-none md:w-[420px]"
          />
          <button className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">
            Buscar
          </button>
        </form>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border bg-[var(--card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Fantasia</th>
              <th className="px-4 py-3">CNPJ</th>
              <th className="px-4 py-3">CEP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-3 font-medium">{c.code}</td>
                <td className="px-4 py-3">{c.name}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{c.tradeName ?? "-"}</td>
                <td className="px-4 py-3">{c.cnpj ?? "-"}</td>
                <td className="px-4 py-3">{c.cep ?? "-"}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-[var(--muted)]" colSpan={5}>
                  Nenhum cliente encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
