import { getFocusEnv } from "./config";

function basicAuthHeader(token: string): string {
  const raw = `${token}:`;
  const b64 = Buffer.from(raw, "utf-8").toString("base64");
  return `Basic ${b64}`;
}

export async function focusFetch(pathname: string, init: RequestInit = {}) {
  const { baseUrl, token } = getFocusEnv();
  const url = `${baseUrl}${pathname.startsWith("/") ? "" : "/"}${pathname}`;

  const headers = new Headers(init.headers);
  headers.set("Authorization", basicAuthHeader(token));
  if (!headers.has("accept")) headers.set("accept", "application/json");

  const timeoutMsRaw = process.env.FOCUS_HTTP_TIMEOUT_MS ?? "15000";
  const timeoutMs = Number(timeoutMsRaw);
  const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  // allow process to exit
  (timeout as unknown as { unref?: () => void }).unref?.();

  try {
    return await fetch(url, { ...init, headers, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`Focus HTTP timeout after ${ms}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
