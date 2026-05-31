export class FiscalEngineError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export class FiscalValidationError extends FiscalEngineError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("FISCAL_VALIDATION_ERROR", message, details);
  }
}

