import type { FiscalTaxRuleEngine } from "./ports";
import type { FiscalInvoiceDraft, TaxCalculationResult } from "./types";

export class NoopTaxRuleEngine implements FiscalTaxRuleEngine {
  async calculate(draft: FiscalInvoiceDraft): Promise<TaxCalculationResult[]> {
    return draft.itens.map((i) => ({ itemId: i.itemId, taxes: [] }));
  }
}

