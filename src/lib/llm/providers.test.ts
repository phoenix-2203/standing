import { describe, expect, it } from "vitest";
import { groq, LlmError, retryWaitMs } from "./providers";

const REQ = { system: "s", user: "u", schemaName: "x", schema: { type: "object" } };
const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }] }), { status: 200 });
const status = (code: number, headers: Record<string, string> = {}) => new Response(JSON.stringify({ error: { message: `busy ${code}` } }), { status: code, headers });

function provider(script: (() => Response | Promise<Response>)[]) {
  const waits: number[] = [];
  let calls = 0;
  const f = (async () => {
    const step = script[calls++];
    if (!step) throw new Error("unexpected extra call");
    return step();
  }) as unknown as typeof fetch;
  const p = groq({ apiKey: "k", fetch: f, sleep: async (ms) => void waits.push(ms) });
  return { p, waits, calls: () => calls };
}

const dropped = () => {
  throw new TypeError("fetch failed");
};
const timedOut = () => {
  throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
};

describe("LLM call retry", () => {
  it("retries once after a 429 or 5xx and returns the second answer", async () => {
    for (const code of [429, 500, 502, 503, 504]) {
      const t = provider([() => status(code), ok]);
      expect(await t.p.generateJson(REQ)).toEqual({ a: 1 });
      expect(t.calls()).toBe(2);
    }
  });

  it("waits Retry-After seconds plus 1 s, capped at 20 s, else 1 s", async () => {
    const t = provider([() => status(429, { "retry-after": "2" }), ok]);
    await t.p.generateJson(REQ);
    expect(t.waits).toEqual([3000]);
    expect([retryWaitMs("30"), retryWaitMs("17"), retryWaitMs(null), retryWaitMs("soon"), retryWaitMs("0")]).toEqual([20000, 18000, 1000, 1000, 0]);
  });

  it("retries a dropped connection once", async () => {
    const t = provider([dropped, ok]);
    expect(await t.p.generateJson(REQ)).toEqual({ a: 1 });
  });

  it("never makes more than two calls, whatever fails, except a repeated 429", async () => {
    for (const script of [[() => status(503), () => status(503)], [() => status(429), dropped], [dropped, () => status(503)], [dropped, dropped]]) {
      const t = provider(script);
      await expect(t.p.generateJson(REQ)).rejects.toBeInstanceOf(LlmError);
      expect(t.calls()).toBe(2);
    }
  });

  it("waits through two 429s (a second question within a minute), then stops at three calls", async () => {
    const a = provider([() => status(429, { "retry-after": "17" }), () => status(429, { "retry-after": "2" }), ok]);
    expect(await a.p.generateJson(REQ)).toEqual({ a: 1 });
    expect(a.waits).toEqual([18000, 3000]);
    const b = provider([() => status(429), () => status(429), () => status(429), ok]);
    await expect(b.p.generateJson(REQ)).rejects.toThrow(/HTTP 429/);
    expect(b.calls()).toBe(3);
  });

  it("does not retry a timeout or a 4xx that isn't 429", async () => {
    const a = provider([timedOut]);
    await expect(a.p.generateJson(REQ)).rejects.toThrow(/TimeoutError/);
    expect(a.calls()).toBe(1);
    const b = provider([() => status(400)]);
    await expect(b.p.generateJson(REQ)).rejects.toThrow(/HTTP 400/);
    expect(b.calls()).toBe(1);
  });
});
