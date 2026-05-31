import { getDb } from "@/lib/db";
import { gerarBoletoMockAction } from "./actions";

type Row = {
  id: string;
  status: string;
  method: string;
  amount: number;
  dueDate: string;
  customerName: string;
  orderId: number | null;
  hasBoleto: number;
};

function listReceivables(limit = 80): Row[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT
        r.id as id,
        r.status as status,
        r.method as method,
        r.amount as amount,
        r.due_date as dueDate,
        c.name as customerName,
        r.order_id as orderId,
        CASE WHEN b.receivable_id IS NULL THEN 0 ELSE 1 END as hasBoleto
      FROM receivables r
      JOIN customers c ON c.id = r.customer_id
      LEFT JOIN boletos b ON b.receivable_id = r.id
      ORDER BY r.created_at DESC
      LIMIT ?
    `
    )
    .all(limit) as Row[];
}

export default function FinanceiroPage() {
  const rows = listReceivables();
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <h1 className="text-2xl font-semibold">Financeiro</h1>
      <div className="mt-1 text-sm text-[var(--muted)]">Recebíveis (boletos/PIX/etc).</div>

      <div className="mt-5 overflow-hidden rounded-2xl border bg-[var(--card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Pedido</th>
              <th className="px-4 py-3">Método</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Boleto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-3">{r.customerName}</td>
                <td className="px-4 py-3">{r.orderId ? `#${r.orderId}` : "-"}</td>
                <td className="px-4 py-3">{r.method}</td>
                <td className="px-4 py-3">{new Date(r.dueDate).toLocaleDateString("pt-BR")}</td>
                <td className="px-4 py-3 font-semibold">{money.format(r.amount)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-black/[0.04] px-3 py-1 text-xs font-semibold">
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {r.method === "BOLETO" ? (
                    r.hasBoleto ? (
                      <span className="text-xs text-[var(--muted)]">Gerado</span>
                    ) : (
                      <form action={gerarBoletoMockAction}>
                        <input type="hidden" name="receivableId" value={r.id} />
                        <button className="rounded-xl border bg-[var(--card)] px-3 py-2 text-xs font-semibold hover:bg-black/[0.03]">
                          Gerar (mock)
                        </button>
                      </form>
                    )
                  ) : (
                    <span className="text-xs text-[var(--muted)]">-</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-[var(--muted)]" colSpan={7}>
                  Nenhum recebível ainda. Ao criar pedido com preço, um recebível BOLETO é criado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
