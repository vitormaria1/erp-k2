export const FISCAL_OPERATION_CODE_VENDA_INTERNA = "VENDA_INTERNA";
export const FISCAL_OPERATION_CODE_BONIFICACAO_5910 = "BONIFICACAO_SIMPLES_5910";

export const PEDIDO_FISCAL_OPERATION_OPTIONS = [
  {
    code: FISCAL_OPERATION_CODE_VENDA_INTERNA,
    label: "Venda normal",
    description: "5101 • VENDA - PROD. INDU",
  },
  {
    code: FISCAL_OPERATION_CODE_BONIFICACAO_5910,
    label: "Bonificacao",
    description: "5910 • BONIFICACAO SIMPLES NACIONAL",
  },
] as const;

export type PedidoFiscalOperationCode = (typeof PEDIDO_FISCAL_OPERATION_OPTIONS)[number]["code"];

export function isPedidoFiscalOperationCode(value: unknown): value is PedidoFiscalOperationCode {
  return PEDIDO_FISCAL_OPERATION_OPTIONS.some((option) => option.code === value);
}
