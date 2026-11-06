import { afterEach, describe, expect, it } from "vitest";
import { POST as actionCancel } from "@/app/api/actions/[requestId]/cancel/route";
import { POST as actionSend } from "@/app/api/actions/[requestId]/send/route";
import { POST as ask } from "@/app/api/ask/route";
import { GET as checklist } from "@/app/api/checklist/route";
import { POST as digitalComplete } from "@/app/api/digital/orders/[captureId]/complete/route";
import { POST as digitalProof } from "@/app/api/digital/orders/[captureId]/proof/route";
import { GET as digitalOrders } from "@/app/api/digital/orders/route";
import { POST as launchPlans } from "@/app/api/launch-plans/route";
import { GET as packPdf } from "@/app/api/packs/[id]/pdf/route";
import { GET as dashboard } from "@/app/api/dashboard/route";
import { GET as orders } from "@/app/api/orders/route";
import { GET as packsList, POST as packsBuild } from "@/app/api/packs/route";
import { GET as packView } from "@/app/api/packs/[id]/route";
import { GET as devSession } from "@/app/api/dev/session/route";

const req = (method: string, cookie?: string) => new Request("https://standing.test/x", { method, headers: cookie ? { cookie } : {}, body: method === "POST" ? "{}" : undefined });
const params = <T,>(p: T) => ({ params: Promise.resolve(p) }) as never;

describe("seller routes need a session", () => {
  it.each<[string, (r: Request) => Promise<Response>, string]>([
    ["GET /api/checklist", (r) => checklist(r), "GET"],
    ["POST /api/launch-plans", (r) => launchPlans(r), "POST"],
    ["POST /api/ask", (r) => ask(r), "POST"],
    ["GET /api/digital/orders", (r) => digitalOrders(r), "GET"],
    ["POST …/complete", (r) => digitalComplete(r, params({ captureId: "X" })), "POST"],
    ["POST …/proof", (r) => digitalProof(r, params({ captureId: "X" })), "POST"],
    ["POST …/cancel", (r) => actionCancel(r, params({ requestId: "X" })), "POST"],
    ["POST …/send", (r) => actionSend(r, params({ requestId: "X" })), "POST"],
    ["GET /api/packs/[id]/pdf", (r) => packPdf(r, params({ id: "00000000-0000-0000-0000-000000000001" })), "GET"],
    ["GET /api/dashboard", (r) => dashboard(r), "GET"],
    ["GET /api/orders", (r) => orders(r), "GET"],
    ["GET /api/packs", (r) => packsList(r), "GET"],
    ["POST /api/packs", (r) => packsBuild(r), "POST"],
    ["GET /api/packs/[id]", (r) => packView(r, params({ id: "00000000-0000-0000-0000-000000000001" })), "GET"],
  ])("%s: 401 with no cookie or a forged one", async (_n, handler, method) => {
    process.env.SESSION_SECRET = "route-test-secret";
    expect((await handler(req(method))).status).toBe(401);
    expect((await handler(req(method, "standing_session=c2VsbGVy.9999999999.forged"))).status).toBe(401);
  });
});

describe("the development login", () => {
  const env = { ...process.env };
  const set = (k: string, v?: string) => {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string | undefined>)[k] = v;
  };
  afterEach(() => {
    for (const k of ["NODE_ENV", "STANDING_DEV_LOGIN", "SESSION_SECRET"]) set(k, env[k]);
  });

  it("is off in a production build, even with the flag on", async () => {
    set("NODE_ENV", "production");
    set("STANDING_DEV_LOGIN", "1");
    set("SESSION_SECRET", "s");
    const res = await devSession(new Request("http://localhost:3000/api/dev/session"));
    expect(res.status).toBe(404);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("is off without the flag", async () => {
    set("NODE_ENV", "development");
    set("STANDING_DEV_LOGIN", undefined);
    set("SESSION_SECRET", "s");
    expect((await devSession(new Request("http://localhost:3000/api/dev/session"))).status).toBe(404);
  });

  it("opens a session in development with the flag on", async () => {
    set("NODE_ENV", "development");
    set("STANDING_DEV_LOGIN", "1");
    set("SESSION_SECRET", "s");
    const res = await devSession(new Request("http://localhost:3000/api/dev/session"));
    expect(res.status).toBe(302);
    expect(res.headers.getSetCookie()[0]).toMatch(/^standing_session=/);
  });
});
