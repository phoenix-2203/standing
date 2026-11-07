import { describe, expect, it } from "vitest";
import { crossSiteWrite } from "./origin";

const req = (method: string, path: string, headers: Record<string, string> = {}) =>
  new Request(`http://127.0.0.1:3100${path}`, { method, headers: { host: "goodstanding.duckdns.org", ...headers } });

describe("crossSiteWrite", () => {
  it("allows reads, and writes from the app's own pages", () => {
    expect(crossSiteWrite(req("GET", "/api/dashboard", { origin: "https://evil.example" }))).toBeNull();
    expect(crossSiteWrite(req("POST", "/api/packs", { origin: "https://goodstanding.duckdns.org", "sec-fetch-site": "same-origin" }))).toBeNull();
    expect(crossSiteWrite(req("POST", "/api/packs", { origin: "https://GoodStanding.duckdns.org" }))).toBeNull();
  });

  it("allows the second hostname served by the same app (Host header decides, not a fixed list)", () => {
    expect(crossSiteWrite(req("POST", "/api/ask", { host: "standing.104-251-218-80.sslip.io", origin: "https://standing.104-251-218-80.sslip.io" }))).toBeNull();
  });

  it("uses X-Forwarded-Host when a proxy sets it", () => {
    expect(crossSiteWrite(req("POST", "/api/ask", { host: "127.0.0.1:3100", "x-forwarded-host": "goodstanding.duckdns.org", origin: "https://goodstanding.duckdns.org" }))).toBeNull();
  });

  it("refuses writes from another site, a sibling site, or an opaque origin", () => {
    expect(crossSiteWrite(req("POST", "/api/actions/x/send", { origin: "https://evil.example" }))).toMatch(/not this site/);
    expect(crossSiteWrite(req("DELETE", "/api/products/1", { origin: "https://other.duckdns.org" }))).toMatch(/not this site/);
    expect(crossSiteWrite(req("POST", "/api/packs", { origin: "https://goodstanding.duckdns.org", "sec-fetch-site": "same-site" }))).toMatch(/same-site/);
    expect(crossSiteWrite(req("POST", "/api/packs", { "sec-fetch-site": "cross-site" }))).toMatch(/cross-site/);
    expect(crossSiteWrite(req("POST", "/api/ask", { origin: "null" }))).toMatch(/unparseable/);
  });

  it("allows writes with no Origin (not a cross-origin browser request) and exempts PayPal's webhook and the scheduler", () => {
    expect(crossSiteWrite(req("POST", "/api/ask"))).toBeNull();
    expect(crossSiteWrite(req("POST", "/api/webhooks/paypal", { origin: "https://evil.example" }))).toBeNull();
    expect(crossSiteWrite(req("POST", "/api/cron/run", { "sec-fetch-site": "cross-site" }))).toBeNull();
  });
});
