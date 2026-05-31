import type { FiscalDbClient } from "../../infra/pg";

export class FiscalSequenceRepositoryPg {
  async reserveNextNumber(args: {
    client: FiscalDbClient;
    issuerCnpj: string;
    model: number;
    serie: string;
    startAt?: number;
  }): Promise<number> {
    const startAt = args.startAt ?? 1;

    await args.client.query(
      `
      INSERT INTO fiscal_sequences (issuer_cnpj, model, serie, next_number)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (issuer_cnpj, model, serie) DO NOTHING
    `,
      [args.issuerCnpj, args.model, args.serie, startAt]
    );

    const res = await args.client.query(
      `
      UPDATE fiscal_sequences
      SET next_number = next_number + 1, updated_at = now()
      WHERE issuer_cnpj = $1 AND model = $2 AND serie = $3
      RETURNING (next_number - 1) as reserved
    `,
      [args.issuerCnpj, args.model, args.serie]
    );
    if (!res.rowCount) throw new Error("Sequence not found/created");
    return (res.rows[0] as { reserved: number }).reserved;
  }
}
