export type FocusIssueNfeResponse =
  | {
      ref: string;
      status: string;
      status_sefaz?: string;
      mensagem_sefaz?: string;
      chave_nfe?: string;
      numero?: string;
      serie?: string;
      caminho_xml_nota_fiscal?: string;
      caminho_danfe?: string;
    }
  | {
      codigo: string;
      mensagem: string;
      campos?: unknown;
    };

export type FocusConsultNfeResponse = {
  ref: string;
  status: string;
  status_sefaz?: string;
  mensagem_sefaz?: string;
  chave_nfe?: string;
  numero?: string;
  serie?: string;
  caminho_xml_nota_fiscal?: string;
  caminho_danfe?: string;
  protocolo?: unknown;
  requisicao?: unknown;
  eventos?: unknown[];
  [k: string]: unknown;
};

