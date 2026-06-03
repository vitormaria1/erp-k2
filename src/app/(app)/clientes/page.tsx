import Link from "next/link";

import { listCustomers } from "@/lib/queries";

export default async function ClientesPage(props: { searchParams?: Promise<{ q?: string }> }) {
  const sp = (await props.searchParams) ?? {};
  const q = sp.q ?? "";
  const rows = listCustomers({ q, limit: 250 });

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <div className="text-sm text-[var(--muted)]">
            Cadastro completo importado do PDF ou mantido manualmente.
          </div>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <form className="flex gap-2" action="/clientes" method="GET">
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por nome, CNPJ, código, cidade..."
              className="w-full rounded-xl border bg-[var(--card)] px-4 py-3 text-sm outline-none md:w-[420px]"
            />
            <button className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">
              Buscar
            </button>
          </form>
          <Link
            href="/clientes/novo"
            className="rounded-xl bg-[var(--k2-red-2)] px-4 py-3 text-center text-sm font-semibold text-white"
          >
            Novo cliente
          </Link>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border bg-[var(--card)] shadow-sm">
        <table className="min-w-[2200px] w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Fantasia</th>
              <th className="px-4 py-3">CPF/CNPJ</th>
              <th className="px-4 py-3">IE</th>
              <th className="px-4 py-3">TP Cad.</th>
              <th className="px-4 py-3">Contrib.</th>
              <th className="px-4 py-3">CEP</th>
              <th className="px-4 py-3">Endereço</th>
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Complemento</th>
              <th className="px-4 py-3">Bairro</th>
              <th className="px-4 py-3">Cidade</th>
              <th className="px-4 py-3">UF</th>
              <th className="px-4 py-3">Cod. Mun.</th>
              <th className="px-4 py-3">País</th>
              <th className="px-4 py-3">Cod. País</th>
              <th className="px-4 py-3">Telefone</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Home page</th>
              <th className="px-4 py-3">Acomp. pedidos</th>
              <th className="px-4 py-3">Data cad.</th>
              <th className="px-4 py-3">Última atualiz.</th>
              <th className="px-4 py-3">Bloqueado</th>
              <th className="px-4 py-3">Motivo bloqueio</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t align-top">
                <td className="px-4 py-3 font-medium">{c.code}</td>
                <td className="px-4 py-3 font-semibold">{c.name}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{c.tradeName ?? "-"}</td>
                <td className="px-4 py-3">{c.cnpj ?? "-"}</td>
                <td className="px-4 py-3">{c.stateTaxId ?? "-"}</td>
                <td className="px-4 py-3">{c.customerTypeCode ?? "-"}</td>
                <td className="px-4 py-3">{c.taxpayer ? "Sim" : "Não"}</td>
                <td className="px-4 py-3">{c.cep ?? "-"}</td>
                <td className="px-4 py-3">{c.street ?? "-"}</td>
                <td className="px-4 py-3">{c.number ?? "-"}</td>
                <td className="px-4 py-3">{c.complement ?? "-"}</td>
                <td className="px-4 py-3">{c.neighborhood ?? "-"}</td>
                <td className="px-4 py-3">{c.city ?? "-"}</td>
                <td className="px-4 py-3">{c.uf ?? "-"}</td>
                <td className="px-4 py-3">{c.cityCode ?? "-"}</td>
                <td className="px-4 py-3">{c.country ?? "-"}</td>
                <td className="px-4 py-3">{c.countryCode ?? "-"}</td>
                <td className="px-4 py-3">{c.phone ?? "-"}</td>
                <td className="px-4 py-3">{c.email ?? "-"}</td>
                <td className="px-4 py-3">{c.homePage ?? "-"}</td>
                <td className="px-4 py-3">{c.tracksOrders ? "Sim" : "Não"}</td>
                <td className="px-4 py-3">{c.registeredAt ?? "-"}</td>
                <td className="px-4 py-3">{c.lastUpdatedAt ?? "-"}</td>
                <td className="px-4 py-3">{c.blocked ? "Sim" : "Não"}</td>
                <td className="px-4 py-3">{c.blockReason ?? "-"}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/clientes/${c.id}/editar`}
                    className="rounded-xl border bg-[var(--card)] px-3 py-2 text-xs font-semibold hover:bg-black/[0.03]"
                  >
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-[var(--muted)]" colSpan={26}>
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
