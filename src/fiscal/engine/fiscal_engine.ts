import { FiscalValidationError } from "./errors";
import type {
  FiscalOperationRepository,
  FiscalPayloadBuilder,
  FiscalProfileRepository,
  FiscalTaxRuleEngine,
  ProductFiscalDataRepository,
} from "./ports";
import { FiscalInvoiceDraftSchema, type FiscalInvoiceDraft } from "./types";

export class FiscalEngine<FocusPayload> {
  constructor(
    private readonly deps: {
      productFiscalDataRepo: ProductFiscalDataRepository;
      fiscalProfileRepo: FiscalProfileRepository;
      fiscalOperationRepo: FiscalOperationRepository;
      taxRuleEngine: FiscalTaxRuleEngine;
      payloadBuilder: FiscalPayloadBuilder<FocusPayload>;
    }
  ) {}

  async validateDraft(input: unknown): Promise<FiscalInvoiceDraft> {
    const parsed = FiscalInvoiceDraftSchema.safeParse(input);
    if (!parsed.success) {
      throw new FiscalValidationError("Payload de emissão inválido", {
        issues: parsed.error.issues,
      });
    }

    const draft = parsed.data;
    const [profile, operation] = await Promise.all([
      this.deps.fiscalProfileRepo.getByCode(draft.fiscalProfileCode),
      this.deps.fiscalOperationRepo.getByCode(draft.fiscalOperationCode),
    ]);
    if (!profile) {
      throw new FiscalValidationError("Perfil fiscal não encontrado", {
        fiscalProfileCode: draft.fiscalProfileCode,
      });
    }
    if (!operation) {
      throw new FiscalValidationError("Operação fiscal não encontrada", {
        fiscalOperationCode: draft.fiscalOperationCode,
      });
    }

    const uniqueProducts = new Set(draft.itens.map((i) => i.productId));
    for (const productId of uniqueProducts) {
      const fiscalData = await this.deps.productFiscalDataRepo.getByProductId(productId);
      if (!fiscalData) {
        throw new FiscalValidationError("Produto sem cadastro fiscal", { productId });
      }
    }

    return draft;
  }

  async calculateTaxes(draft: FiscalInvoiceDraft) {
    return this.deps.taxRuleEngine.calculate(draft);
  }

  async buildFocusPayload(draft: FiscalInvoiceDraft, ctx?: { client?: import("../infra/pg").FiscalDbClient }) {
    const taxes = await this.calculateTaxes(draft);
    const payload = await this.deps.payloadBuilder.build(draft, taxes, ctx);
    return { payload, taxes };
  }
}
