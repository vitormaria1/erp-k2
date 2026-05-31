import { issueNfeHomologacao } from "../../../../../fiscal/usecases/issue_nfe";

function assertInternalAuth(req: Request) {
  const required = (process.env.INTERNAL_API_TOKEN ?? "").trim();
  if (!required) return;
  const provided = req.headers.get("x-internal-token") ?? "";
  if (provided !== required) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}

export async function POST(req: Request) {
  const authErr = assertInternalAuth(req);
  if (authErr) return authErr;

  const body = await req.json();
  const result = await issueNfeHomologacao(body);
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

