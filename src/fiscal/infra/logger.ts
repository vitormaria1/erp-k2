export interface FiscalLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export const consoleFiscalLogger: FiscalLogger = {
  info(message, meta) {
    console.log(message, meta ?? {});
  },
  warn(message, meta) {
    console.warn(message, meta ?? {});
  },
  error(message, meta) {
    console.error(message, meta ?? {});
  },
};
