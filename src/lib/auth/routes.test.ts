import { describe, expect, it } from "vitest";
import { POST as actionCancel } from "@/app/api/actions/[requestId]/cancel/route";
import { POST as actionSend } from "@/app/api/actions/[requestId]/send/route";
import { POST as ask } from "@/app/api/ask/route";
import { GET as checklist } from "@/app/api/checklist/route";
import { POST as digitalComplete } from "@/app/api/digital/orders/[captureId]/complete/route";
import { POST as digitalProof } from "@/app/api/digital/orders/[captureId]/proof/route";
import { GET as digitalOrders } from "@/app/api/digital/orders/route";
import { POST as launchPlans } from "@/app/api/launch-plans/route";
import { GET as packPdf } from "@/app/api/packs/[id]/pdf/route";

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
  ])("%s: 401 with no cookie or a forged one", async (_n, handler, method) => {
    process.env.SESSION_SECRET = "route-test-secret";
    expect((await handler(req(method))).status).toBe(401);
    expect((await handler(req(method, "standing_session=c2VsbGVy.9999999999.forged"))).status).toBe(401);
  });
});
