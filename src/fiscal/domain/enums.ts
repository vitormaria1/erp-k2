export type NFeModel = 55;

export type Ambiente = "homologacao" | "producao";

export type LocalDestino = 1 | 2 | 3; // 1 interna, 2 interestadual, 3 exterior

export type TipoDocumento = 0 | 1; // 0 entrada, 1 saída

export type FinalidadeEmissao = 1 | 2 | 3 | 4; // 1 normal, 2 complementar, 3 ajuste, 4 devolução

export type PresencaComprador = 0 | 1 | 2 | 3 | 4 | 9;

export type ConsumidorFinal = 0 | 1;

export type InvoiceInternalStatus =
  | "DRAFT"
  | "READY_TO_ISSUE"
  | "ISSUING"
  | "CANCELING"
  | "AUTHORIZED"
  | "DENIED"
  | "REJECTED"
  | "CANCELED"
  | "ERROR";

export type FocusNFeStatus =
  | "processando_autorizacao"
  | "autorizado"
  | "cancelado"
  | "erro_autorizacao"
  | "rejeitado"
  | "denegado"
  | "em_digitacao"
  | "invalidado"
  | string;
