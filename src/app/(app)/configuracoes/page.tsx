import Link from "next/link";

import { getConfiguredFocusAmbiente, getFocusEnv } from "@/fiscal/providers/focus";
import { getIssuerConfig } from "@/fiscal/config/issuer";
import { getNfeDefaults, pickNfeDefaultsByAmbiente } from "@/fiscal/config/nfe_defaults";

type HealthCardProps = {
  title: string;
  ok: boolean;
  summary: string;
  details: string[];
};

function HealthCard(props: HealthCardProps) {
  return (
    <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{props.title}</h2>
        <span
          className={[
            "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
            props.ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800",
          ].join(" ")}
        >
          {props.ok ? "OK" : "Pendente"}
        </span>
      </div>
      <div className="mt-2 text-sm text-[var(--muted)]">{props.summary}</div>
      <div className="mt-4 space-y-2 text-sm">
        {props.details.map((detail) => (
          <div key={detail} className="rounded-xl border bg-black/[0.02] px-3 py-2">
            {detail}
          </div>
        ))}
      </div>
    </div>
  );
}

function getFocusHealth() {
  try {
    const env = getFocusEnv();
    return {
      ok: true,
      summary: `Integração habilitada em ${env.ambiente}.`,
      details: [
        `Ambiente: ${env.ambiente}`,
        `Base URL: ${env.baseUrl}`,
        `Token: configurado`,
      ],
    };
  } catch (error) {
    return {
      ok: false,
      summary: "A integração Focus ainda precisa de configuração válida.",
      details: [error instanceof Error ? error.message : String(error)],
    };
  }
}

function getIssuerHealth() {
  try {
    const issuer = getIssuerConfig();
    return {
      ok: true,
      summary: `${issuer.razaoSocial} pronta para emissão fiscal.`,
      details: [
        `CNPJ: ${issuer.cnpj}`,
        `IE: ${issuer.ie}`,
        `Município: ${issuer.endereco.municipio}/${issuer.endereco.uf}`,
        `CEP: ${issuer.endereco.cep}`,
      ],
    };
  } catch (error) {
    return {
      ok: false,
      summary: "Os dados do emitente fiscal ainda não estão completos.",
      details: [error instanceof Error ? error.message : String(error)],
    };
  }
}

function getDefaultsHealth() {
  const ambiente = getConfiguredFocusAmbiente();
  try {
    const defaults = pickNfeDefaultsByAmbiente(getNfeDefaults(), ambiente);
    return {
      ok: true,
      summary: "Série, numeração e perfil padrão carregados.",
      details: [
        `Ambiente atual: ${ambiente}`,
        `Série: ${defaults.serie}`,
        `Início da numeração: ${defaults.startNumber}`,
        `Operação padrão: ${defaults.defaultOperationCode}`,
        `Perfil padrão: ${defaults.defaultProfileCode}`,
      ],
    };
  } catch (error) {
    return {
      ok: false,
      summary: "Há inconsistência nas variáveis de série/numeração fiscal.",
      details: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export default function ConfiguracoesPage() {
  const focus = getFocusHealth();
  const issuer = getIssuerHealth();
  const defaults = getDefaultsHealth();

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Configurações</h1>
          <div className="text-sm text-[var(--muted)]">
            Painel operacional das configurações atuais do ERP e da emissão fiscal.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/nota-fiscal" className="rounded-xl border px-4 py-3 text-sm font-semibold">
            Abrir módulo fiscal
          </Link>
          <Link href="/clientes" className="rounded-xl bg-[var(--k2-red-2)] px-4 py-3 text-sm font-semibold text-white">
            Revisar clientes
          </Link>
        </div>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <HealthCard title="Focus NFe" ok={focus.ok} summary={focus.summary} details={focus.details} />
        <HealthCard title="Emitente fiscal" ok={issuer.ok} summary={issuer.summary} details={issuer.details} />
        <HealthCard title="Padrões NF-e" ok={defaults.ok} summary={defaults.summary} details={defaults.details} />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
          <h2 className="text-base font-semibold">Atalhos de manutenção</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Link href="/estoque" className="rounded-2xl border p-4 hover:bg-black/[0.02]">
              <div className="font-semibold">Produtos</div>
              <div className="mt-1 text-sm text-[var(--muted)]">Preço, custo, estoque e receitas.</div>
            </Link>
            <Link href="/clientes" className="rounded-2xl border p-4 hover:bg-black/[0.02]">
              <div className="font-semibold">Clientes</div>
              <div className="mt-1 text-sm text-[var(--muted)]">Cadastro fiscal e endereços de entrega.</div>
            </Link>
            <Link href="/fornecedores" className="rounded-2xl border p-4 hover:bg-black/[0.02]">
              <div className="font-semibold">Fornecedores</div>
              <div className="mt-1 text-sm text-[var(--muted)]">Histórico de compras e parceiros ativos.</div>
            </Link>
            <Link href="/compras" className="rounded-2xl border p-4 hover:bg-black/[0.02]">
              <div className="font-semibold">Compras</div>
              <div className="mt-1 text-sm text-[var(--muted)]">Lançamento de notas de entrada e custo.</div>
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-sm">
          <h2 className="text-base font-semibold">Escopo atual do MVP</h2>
          <div className="mt-4 space-y-3 text-sm text-[var(--muted)]">
            <div className="rounded-2xl border bg-black/[0.02] p-4">
              `Produtos` e `Clientes` já estão ativos como módulos operacionais do ERP.
            </div>
            <div className="rounded-2xl border bg-black/[0.02] p-4">
              `Fornecedores` foi estruturado a partir das notas de compra já lançadas, sem tabela dedicada neste momento.
            </div>
            <div className="rounded-2xl border bg-black/[0.02] p-4">
              Se você quiser cadastro completo de fornecedor com CNPJ, contato e endereço, o próximo passo é modelar uma tabela própria e integrar com `Compras`.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
