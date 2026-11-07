// Cross-site write check (defence in depth on top of the SameSite=Lax session cookie).
// A browser always sends Origin on a cross-origin POST, PUT, PATCH or DELETE, and modern browsers send
// Sec-Fetch-Site. A write to /api is refused when either says the request came from another site, including
// a sibling site on the same parent domain (Sec-Fetch-Site: same-site), since the hosted app shares a VPS.
// PayPal's webhook and the scheduler call from servers with no browser cookies, so they are exempt.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const SERVER_TO_SERVER = ["/api/webhooks/", "/api/cron/"];

export function crossSiteWrite(request: Request): string | null {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return null;
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/") || SERVER_TO_SERVER.some((p) => path.startsWith(p))) return null;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return `sec-fetch-site ${fetchSite}`;

  const origin = request.headers.get("origin");
  if (origin === null) return null; // not a browser cross-origin request: it can't carry the seller's cookie
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return "origin unparseable"; // includes "null" from sandboxed frames
  }
  const hosts = [request.headers.get("x-forwarded-host"), request.headers.get("host"), new URL(request.url).host]
    .filter((h): h is string => !!h)
    .flatMap((h) => h.split(",").map((s) => s.trim().toLowerCase()));
  return hosts.includes(originHost.toLowerCase()) ? null : `origin ${originHost} is not this site`;
}
