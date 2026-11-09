import { afterEach, describe, expect, it } from "vitest";
import { POST as logout } from "@/app/api/auth/logout/route";
import { crossSiteWrite } from "./origin";
import { sessionCookie, sessionSeller } from "./session";

const SECRET = "test-secret";
const prevBase = process.env.APP_BASE_URL;
afterEach(() => {
  if (prevBase === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = prevBase;
});

describe("log out", () => {
  it("expires the session cookie and sends you home with a 303", async () => {
    process.env.APP_BASE_URL = "https://standing.test";
    const res = await logout(new Request("https://standing.test/api/auth/logout", { method: "POST" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://standing.test/");
    const set = res.headers.get("set-cookie")!;
    expect(set).toMatch(/^standing_session=;/);
    expect(set).toContain("Max-Age=0");
    expect(set).toContain("HttpOnly");
    expect(set).toContain("Secure");
    expect(set).toContain("Path=/");
  });

  it("leaves no session behind: the cleared cookie isn't a session", async () => {
    process.env.APP_BASE_URL = "https://standing.test";
    const live = sessionCookie("seller-1", SECRET, true).split(";")[0];
    expect(sessionSeller(new Request("https://standing.test/", { headers: { cookie: live } }), SECRET)).toBe("seller-1");
    const cleared = (await logout(new Request("https://standing.test/api/auth/logout", { method: "POST" }))).headers.get("set-cookie")!.split(";")[0];
    expect(sessionSeller(new Request("https://standing.test/", { headers: { cookie: cleared } }), SECRET)).toBeNull();
  });

  it("drops Secure on a plain-http local server", async () => {
    process.env.APP_BASE_URL = "http://localhost:3000";
    const set = (await logout(new Request("http://localhost:3000/api/auth/logout", { method: "POST" }))).headers.get("set-cookie")!;
    expect(set).not.toContain("Secure");
  });

  it("another site can't sign you out (cross-site POST refused by the proxy check)", () => {
    const evil = new Request("https://standing.test/api/auth/logout", { method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } });
    expect(crossSiteWrite(evil)).not.toBeNull();
    const own = new Request("https://standing.test/api/auth/logout", { method: "POST", headers: { origin: "https://standing.test", "sec-fetch-site": "same-origin", host: "standing.test" } });
    expect(crossSiteWrite(own)).toBeNull();
  });
});
