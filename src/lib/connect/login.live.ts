import { expect, it } from "vitest";
import { paypalConnections } from "@/db/schema";
import { testDb } from "@/test/helpers";
import { handleCallback, type LoginConfig, startLogin } from "./login";

// Live checks of Log in with PayPal that need no human login (npm run test:live -- src/lib/connect/login.live.ts).
const config = (): LoginConfig => ({
  baseUrl: process.env.PAYPAL_API_BASE!,
  clientId: process.env.PAYPAL_CLIENT_ID!,
  clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
  sessionSecret: "live-test-only",
  sellerId: "sandbox-seller",
  appBaseUrl: "http://localhost:3000",
});

it("an invalid code against the real sandbox: login fails cleanly, nothing stored, no session", async () => {
  const db = await testDb();
  const res = await handleCallback(new Request("http://localhost:3000/api/auth/paypal/callback?code=NOT-A-REAL-CODE&state=s", { headers: { cookie: "standing_oauth_state=s" } }), db, config());
  console.log("callback →", res.headers.get("location"));
  expect(res.headers.get("location")).toBe("http://localhost:3000/checklist?connect=failed");
  expect(res.headers.getSetCookie().some((c) => c.startsWith("standing_session="))).toBe(false);
  expect(await db.select().from(paypalConnections)).toHaveLength(0);
});

it("the start URL opens PayPal's sandbox login page", async () => {
  const location = startLogin(config()).headers.get("location")!;
  const res = await fetch(location, { redirect: "manual" });
  console.log("sandbox login page → HTTP", res.status);
  expect(res.status).toBeLessThan(500);
});
