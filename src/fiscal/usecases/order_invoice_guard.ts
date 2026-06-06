import { getFiscalDbPool } from "../infra/pg";
import { withPgTx } from "../persistence/pg/tx";
import { FiscalInvoiceRepositoryPg } from "../persistence/pg";

export class OrderAlreadyHasInvoiceError extends Error {
  readonly invoiceId: string;
  readonly invoiceStatus: string;
  readonly invoiceNumber: number | null;
  readonly invoiceSerie: string;

  constructor(args: {
    orderId: number;
    invoiceId: string;
    invoiceStatus: string;
    invoiceNumber: number | null;
    invoiceSerie: string;
  }) {
    const numeroLabel = args.invoiceNumber == null ? "sem número final" : `nº ${args.invoiceNumber}`;
    super(
      `Pedido ${args.orderId} já possui NF em andamento/emitida (${args.invoiceSerie}/${numeroLabel}, status ${args.invoiceStatus}).`
    );
    this.name = "OrderAlreadyHasInvoiceError";
    this.invoiceId = args.invoiceId;
    this.invoiceStatus = args.invoiceStatus;
    this.invoiceNumber = args.invoiceNumber;
    this.invoiceSerie = args.invoiceSerie;
  }
}

export async function assertOrderHasNoActiveInvoice(orderId: number): Promise<void> {
  const pool = getFiscalDbPool();
  const invoiceRepo = new FiscalInvoiceRepositoryPg();
  const existing = await withPgTx(pool, async (client) =>
    invoiceRepo.findActiveBySourceOrderId({ client, sourceOrderId: orderId })
  );
  if (!existing) return;

  throw new OrderAlreadyHasInvoiceError({
    orderId,
    invoiceId: existing.id,
    invoiceStatus: existing.internal_status,
    invoiceNumber: existing.numero,
    invoiceSerie: existing.serie,
  });
}
