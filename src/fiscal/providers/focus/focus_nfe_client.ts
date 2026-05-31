import { focusFetch } from "./http";
import type { FocusConsultNfeResponse, FocusIssueNfeResponse } from "./types";

export class FocusNFeClient {
  async emitirNfe(args: { ref: string; payload: unknown }): Promise<{
    httpStatus: number;
    body: FocusIssueNfeResponse;
  }> {
    const res = await focusFetch(`/v2/nfe?ref=${encodeURIComponent(args.ref)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args.payload),
    });

    const contentType = res.headers.get("content-type") ?? "";
    const body =
      contentType.includes("application/json") ? ((await res.json()) as FocusIssueNfeResponse) : (({
          codigo: "unexpected_content_type",
          mensagem: `Resposta inesperada: ${contentType}`,
        } satisfies FocusIssueNfeResponse) as FocusIssueNfeResponse);

    return { httpStatus: res.status, body };
  }

  async consultarNfe(args: { ref: string; completa?: 0 | 1 }): Promise<{
    httpStatus: number;
    body: FocusConsultNfeResponse;
  }> {
    const q = typeof args.completa === "number" ? `?completa=${args.completa}` : "";
    const res = await focusFetch(`/v2/nfe/${encodeURIComponent(args.ref)}${q}`, { method: "GET" });
    const body = (await res.json()) as FocusConsultNfeResponse;
    return { httpStatus: res.status, body };
  }

  async cancelarNfe(args: { ref: string; justificativa: string }): Promise<{
    httpStatus: number;
    body: unknown;
  }> {
    const res = await focusFetch(`/v2/nfe/${encodeURIComponent(args.ref)}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ justificativa: args.justificativa }),
    });

    const contentType = res.headers.get("content-type") ?? "";
    const body =
      contentType.includes("application/json") ? await res.json() : await res.text();
    return { httpStatus: res.status, body };
  }

  async baixarArquivo(pathFromApi: string): Promise<{
    httpStatus: number;
    body: string;
  }> {
    const res = await focusFetch(pathFromApi, { method: "GET", headers: { accept: "application/xml" } });
    const body = await res.text();
    return { httpStatus: res.status, body };
  }

  async baixarArquivoBin(pathFromApi: string, accept: string): Promise<{
    httpStatus: number;
    body: Buffer;
    contentType: string;
  }> {
    const res = await focusFetch(pathFromApi, { method: "GET", headers: { accept } });
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? accept;
    return { httpStatus: res.status, body: buf, contentType };
  }

  async previsualizarDanfe(args: { payload: unknown }): Promise<{
    httpStatus: number;
    pdf: Buffer;
    contentType: string;
  }> {
    const res = await focusFetch(`/v2/nfe/danfe`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/pdf" },
      body: JSON.stringify(args.payload),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "application/pdf";
    return { httpStatus: res.status, pdf: buf, contentType };
  }
}
