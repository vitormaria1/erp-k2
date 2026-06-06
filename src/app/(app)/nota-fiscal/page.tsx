import { getFiscalDbPool } from "@/fiscal/infra/pg";
import { listFiscalInvoices } from "@/fiscal/persistence/pg/dashboard_queries";
import { formatDateTime } from "@/lib/datetime";

import { FiscalInlineWorkerClient } from "./inline_worker_client";
import { AuthorizedInvoiceClient } from "./authorized-invoice-client";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getInvoiceById(id: string) {
  const pool = getFiscalDbPool();
  const res = await pool.query(
    `
    SELECT
      id, created_at, issuer_cnpj, customer_id, model, serie, numero,
      internal_status, focus_ref, focus_status, sefaz_status, sefaz_message, chave_acesso
    FROM fiscal_invoices
    WHERE id = $1
  `,
    [id]
  );
  return (res.rows[0] as Record<string, unknown> | undefined) ?? null;
}

export default async function NotaFiscalPage(props: { searchParams?: Promise<Record<string, string | string[]>> }) {
  const searchParams: Record<string, string | string[]> =
    (await props.searchParams?.catch(() => ({} as Record<string, string | string[]>))) ?? {};
  const invoiceIdParam = searchParams.invoiceId;
  const invoiceId = typeof invoiceIdParam === "string" ? invoiceIdParam : null;
  const lastInvoice = invoiceId ? await getInvoiceById(invoiceId).catch(() => null) : null;
  const errorParam = searchParams.error;
  const error = typeof errorParam === "string" ? errorParam : null;
  const autoPrintParam = searchParams.autoprint;
  const autoOpenDanfe = autoPrintParam === "1" || autoPrintParam === "true";

  const invoicesRes = await (async () => {
    try {
      const invoices = await listFiscalInvoices(getFiscalDbPool(), 25);
      return { invoices, error: null as string | null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("listFiscalInvoices failed", e);
      return { invoices: [], error: msg };
    }
  })();
  const invoicesError = invoicesRes.error;
  const invoices = invoicesRes.invoices;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <FiscalInlineWorkerClient />
      {invoiceId ? (
        <AuthorizedInvoiceClient
          invoiceId={invoiceId}
          internalStatus={typeof lastInvoice?.internal_status === "string" ? lastInvoice.internal_status : null}
          autoOpenDanfe={autoOpenDanfe}
        />
      ) : null}
      <h1 className="text-2xl font-semibold">Nota Fiscal</h1>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div className="font-semibold">Falha ao emitir</div>
          <div className="mt-1 text-xs break-words">{error}</div>
        </div>
      ) : null}

      {invoiceId ? (
        <div className="mt-4 rounded-2xl border bg-[var(--card)] p-4 text-sm">
          <div className="font-semibold">Emissão solicitada</div>
          {lastInvoice ? (
            <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-[var(--muted)] md:grid-cols-3">
              <div>
                <div className="font-semibold text-[var(--text)]">Série/Número</div>
                <div>
                  {String(lastInvoice.serie ?? "-")}/{String(lastInvoice.numero ?? "-")}
                </div>
              </div>
              <div>
                <div className="font-semibold text-[var(--text)]">Status</div>
                <div>
                  {String(lastInvoice.internal_status ?? "-")} / Focus: {String(lastInvoice.focus_status ?? "-")} /
                  SEFAZ: {String(lastInvoice.sefaz_status ?? "-")}
                </div>
              </div>
              <div>
                <div className="font-semibold text-[var(--text)]">Ref</div>
                <div className="break-all">{String(lastInvoice.focus_ref ?? "-")}</div>
              </div>
              {lastInvoice.sefaz_message ? (
                <div className="md:col-span-3">
                  <div className="font-semibold text-[var(--text)]">Mensagem SEFAZ</div>
                  <div className="break-words">{String(lastInvoice.sefaz_message)}</div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-2 text-xs text-[var(--muted)]">
              NF ainda não encontrada. Se acabou de emitir, aguarde alguns segundos e esta tela atualizará sozinha.
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link className="rounded-lg border px-3 py-1.5 text-xs font-semibold" href="/nota-fiscal">
              Limpar filtro
            </Link>
            {lastInvoice && lastInvoice.internal_status === "AUTHORIZED" ? (
              <a
                className="rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white"
                href={`/api/fiscal/invoices/${lastInvoice.id}/danfe`}
                target="_blank"
                rel="noreferrer"
              >
                Abrir DANFE
              </a>
            ) : null}
            {lastInvoice && lastInvoice.internal_status === "AUTHORIZED" ? (
              <a
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                href={`/api/fiscal/invoices/${lastInvoice.id}/xml`}
                target="_blank"
                rel="noreferrer"
              >
                Baixar XML
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border bg-[var(--card)] p-4 text-xs text-[var(--muted)]">
        Emissão assíncrona: após clicar em Emitir, o documento entra em fila e aparece abaixo. Para processar em background e fazer polling automático, rode o worker em outro terminal:{" "}
        <code>npm run fiscal:worker</code>.
      </div>

      {invoicesError ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div className="font-semibold">Erro ao ler banco fiscal</div>
          <div className="mt-1 text-xs break-words">{invoicesError}</div>
          <div className="mt-2 text-xs text-red-800">
            Confirme que a <code>DATABASE_URL</code> do Supabase está configurada corretamente no ambiente.
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-[var(--card)] p-5">
          <div className="text-sm font-semibold">1) Seed fiscal (a partir de XMLs reais)</div>
          <div className="mt-1 text-xs text-[var(--muted)]">
            Preenche perfil/operação e dados fiscais de produtos no Postgres fiscal.
          </div>
          <form action="/api/fiscal/seed-xml" method="post" className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <label className="text-xs text-[var(--muted)]">Pasta de XMLs</label>
              <input
                name="xmlDir"
                defaultValue="NFes_09572986000149_01052026a26052026"
                className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <button className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white">
              Seed
            </button>
          </form>
          <div className="mt-3 text-xs text-[var(--muted)]">
            Pré-requisitos: `DATABASE_URL` configurada no ambiente
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border bg-[var(--card)] p-5">
        <div className="text-sm font-semibold">Documentos fiscais (Postgres)</div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[var(--muted)]">
              <tr>
                <th className="py-2 pr-3">Criado</th>
                <th className="py-2 pr-3">Série/Número</th>
                <th className="py-2 pr-3">Status interno</th>
                <th className="py-2 pr-3">Focus</th>
                <th className="py-2 pr-3">SEFAZ</th>
                <th className="py-2 pr-3">Chave</th>
                <th className="py-2 pr-3">Arquivos</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td className="py-3 text-[var(--muted)]" colSpan={7}>
                    Nenhuma NF ainda (ou Postgres fiscal não configurado).
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="border-t">
                    <td className="py-2 pr-3">{formatDateTime(inv.created_at)}</td>
                    <td className="py-2 pr-3">
                      {inv.serie}/{inv.numero ?? "-"}
                    </td>
                    <td className="py-2 pr-3">{inv.internal_status}</td>
                    <td className="py-2 pr-3">{inv.focus_status ?? inv.focus_ref ?? "-"}</td>
                    <td className="py-2 pr-3">{inv.sefaz_status ?? "-"}</td>
                    <td className="py-2 pr-3">{inv.chave_acesso ?? "-"}</td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-2">
                        <a
                          className="rounded-lg border px-2 py-1 font-semibold"
                          href={`/api/fiscal/invoices/${inv.id}/xml`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          XML
                        </a>
                        <a
                          className="rounded-lg bg-black px-2 py-1 font-semibold text-white"
                          href={`/api/fiscal/invoices/${inv.id}/danfe`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir DANFE
                        </a>
                        {inv.internal_status === "AUTHORIZED" ? (
                          <form action={`/api/fiscal/invoices/${inv.id}/cancel`} method="post">
                            <input
                              type="hidden"
                              name="justificativa"
                              value="Cancelamento por erro de emissao"
                            />
                            <button className="rounded-lg border border-red-300 px-2 py-1 font-semibold text-red-700">
                              Cancelar
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
