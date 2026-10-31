import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const call = (auth?: string) =>
  POST(new Request("http://localhost/api/cron/run", { method: "POST", headers: auth ? { authorization: auth } : {} }));

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("POST /api/cron/run auth", () => {
  it("refuses to run when no secret is configured", async () => {
    expect((await call("Bearer anything")).status).toBe(500);
  });

  it.each([undefined, "Bearer wrong", "Bearer s3cret-but-longer", "s3cret"])("rejects %j", async (auth) => {
    process.env.CRON_SECRET = "s3cret";
    expect((await call(auth)).status).toBe(401);
  });
});
