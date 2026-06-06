export function getPublicOrigin(req: Request): string {
  const headers = req.headers;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return new URL(req.url).origin;

  const proto = headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function redirectToPublicUrl(req: Request, pathnameOrUrl: string, status = 303) {
  const url = new URL(pathnameOrUrl, getPublicOrigin(req));
  return Response.redirect(url, status);
}
