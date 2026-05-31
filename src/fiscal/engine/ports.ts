import type { FiscalOperation, FiscalProfile, ProductFiscalData } from "../domain";
import type { FiscalInvoiceDraft, TaxCalculationResult } from "./types";
import type { FiscalDbClient } from "../infra/pg";

export interface ProductFiscalDataRepository {
  getByProductId(productId: string): Promise<ProductFiscalData | null>;
}

export interface FiscalProfileRepository {
  getByCode(code: string): Promise<FiscalProfile | null>;
}

export interface FiscalOperationRepository {
  getByCode(code: string): Promise<FiscalOperation | null>;
}

export interface FiscalTaxRuleEngine {
  calculate(draft: FiscalInvoiceDraft): Promise<TaxCalculationResult[]>;
}

export interface FiscalPayloadBuilder<Payload> {
  build(
    draft: FiscalInvoiceDraft,
    taxes: TaxCalculationResult[],
    ctx?: { client?: FiscalDbClient }
  ): Promise<Payload>;
}
