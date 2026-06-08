import { getFiscalDbPool } from "@/fiscal/infra/pg";
import type { FiscalInvoiceListRow } from "@/fiscal/persistence/pg/dashboard_queries";
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

async function listFiscalInvoicesFiltered(args: { q: string; limit: number }) {
  const pool = getFiscalDbPool();
  const q = args.q.trim();

  if (!q) {
    const res = await pool.query(
      `
      SELECT
        id, created_at, issuer_cnpj, customer_id, model, serie, numero,
        internal_status, focus_ref, focus_status, sefaz_status, chave_acesso
      FROM fiscal_invoices
      ORDER BY created_at DESC
      LIMIT $1
    `,
      [args.limit]
    );
    return res.rows as FiscalInvoiceListRow[];
  }

  const like = `%${q}%`;
  const res = await pool.query(
    `
    SELECT
      id, created_at, issuer_cnpj, customer_id, model, serie, numero,
      internal_status, focus_ref, focus_status, sefaz_status, chave_acesso
    FROM fiscal_invoices
    WHERE
      serie ILIKE $1 OR
      COALESCE(numero::text, '') ILIKE $1 OR
      internal_status ILIKE $1 OR
      COALESCE(focus_status, '') ILIKE $1 OR
      COALESCE(sefaz_status, '') ILIKE $1 OR
      COALESCE(chave_acesso, '') ILIKE $1 OR
      COALESCE(focus_ref, '') ILIKE $1
    ORDER BY created_at DESC
    LIMIT $2
  `,
    [like, args.limit]
  );
  return res.rows as FiscalInvoiceListRow[];
}

function getInvoiceStatusMeta(status: string | null | undefined) {
  switch (status) {
    case "AUTHORIZED":
      return { label: "Autorizada", className: "bg-emerald-100 text-emerald-800" };
    case "READY_TO_ISSUE":
    case "ISSUING":
    case "CANCELING":
      return { label: "Processando", className: "bg-amber-100 text-amber-800" };
    case "TEMP_ERROR":
      return { label: "Instabilidade", className: "bg-orange-100 text-orange-800" };
    case "REJECTED":
    case "DENIED":
    case "ERROR":
      return { label: "Falha final", className: "bg-red-100 text-red-800" };
    case "CANCELED":
      return { label: "Cancelada", className: "bg-zinc-200 text-zinc-700" };
    default:
      return { label: status ?? "-", className: "bg-black/[0.05] text-[var(--muted)]" };
  }
}

export default async function NotaFiscalPage(props: { searchParams?: Promise<Record<string, string | string[]>> }) {
  const searchParams: Record<string, string | string[]> =
    (await props.searchParams?.catch(() => ({} as Record<string, string | string[]>))) ?? {};
  const qParam = searchParams.q;
  const q = typeof qParam === "string" ? qParam : "";
  const invoiceIdParam = searchParams.invoiceId;
  const invoiceId = typeof invoiceIdParam === "string" ? invoiceIdParam : null;
  const lastInvoice = invoiceId ? await getInvoiceById(invoiceId).catch(() => null) : null;
  const errorParam = searchParams.error;
  const error = typeof errorParam === "string" ? errorParam : null;
  const autoPrintParam = searchParams.autoprint;
  const autoOpenDanfe = autoPrintParam === "1" || autoPrintParam === "true";
  const lastInvoiceStatusMeta = getInvoiceStatusMeta(
    typeof lastInvoice?.internal_status === "string" ? lastInvoice.internal_status : null
  );

  const invoicesRes = await (async () => {
    try {
      const invoices = await listFiscalInvoicesFiltered({ q, limit: 100 });
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
                <div className="space-y-1">
                  <span className={["inline-flex rounded-full px-2 py-1 text-[11px] font-semibold", lastInvoiceStatusMeta.className].join(" ")}>
                    {lastInvoiceStatusMeta.label}
                  </span>
                  <div>
                    {String(lastInvoice.internal_status ?? "-")} / Focus: {String(lastInvoice.focus_status ?? "-")} /
                    SEFAZ: {String(lastInvoice.sefaz_status ?? "-")}
                  </div>
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
          {lastInvoice?.internal_status === "TEMP_ERROR" ? (
            <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">
              Instabilidade temporária detectada entre Focus/SEFAZ. O ERP continuará tentando automaticamente. Não reemita esta NF agora.
            </div>
          ) : null}
          {lastInvoice && ["READY_TO_ISSUE", "ISSUING", "CANCELING"].includes(String(lastInvoice.internal_status)) ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              A nota ainda está em processamento. Esta tela atualiza sozinha enquanto o worker consulta a Focus.
            </div>
          ) : null}
          {lastInvoice && ["REJECTED", "DENIED", "ERROR"].includes(String(lastInvoice.internal_status)) ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              Esta NF terminou com falha final. Revise a mensagem SEFAZ e os cadastros antes de tentar novamente.
            </div>
          ) : null}
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

      {invoicesError ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div className="font-semibold">Erro ao ler banco fiscal</div>
          <div className="mt-1 text-xs break-words">{invoicesError}</div>
          <div className="mt-2 text-xs text-red-800">
            Confirme que a <code>DATABASE_URL</code> do Supabase está configurada corretamente no ambiente.
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border bg-[var(--card)] p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="text-sm font-semibold">Notas fiscais</div>
          <form action="/nota-fiscal" method="GET" className="flex w-full flex-col gap-2 sm:flex-row md:max-w-xl">
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por serie, numero, status, chave ou ref..."
              className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm"
            />
            <button className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white">Buscar</button>
            {(q || invoiceId) ? (
              <Link className="rounded-xl border px-4 py-2 text-center text-sm font-medium" href="/nota-fiscal">
                Limpar
              </Link>
            ) : null}
          </form>
        </div>
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
                    {q ? "Nenhuma nota encontrada para essa busca." : "Nenhuma NF ainda (ou Postgres fiscal nao configurado)."}
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="border-t">
                    <td className="py-2 pr-3">{formatDateTime(inv.created_at)}</td>
                    <td className="py-2 pr-3">
                      {inv.serie}/{inv.numero ?? "-"}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={[
                          "inline-flex rounded-full px-2 py-1 text-[11px] font-semibold",
                          getInvoiceStatusMeta(inv.internal_status).className,
                        ].join(" ")}
                      >
                        {getInvoiceStatusMeta(inv.internal_status).label}
                      </span>
                    </td>
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
