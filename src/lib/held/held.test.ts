import { describe, expect, it } from "vitest";
import { DONT, type HeldInput, heldSteps } from "./held";

const base: HeldInput = {
  verification: "verified",
  trackingMissing: 0,
  digitalNotCompleted: 0,
  evidenceAdded: 1,
  latestPack: { id: "p1", status: "ready" },
};
const state = (i: Partial<HeldInput>) =>
  Object.fromEntries(heldSteps({ ...base, ...i }).map((s) => [s.id, s.state]));

describe("heldSteps", () => {
  it("puts what PayPal can check first: tracking, digital, verification, then evidence and the pack", () => {
    expect(heldSteps(base).map((s) => s.id)).toEqual([
      "tracking",
      "digital",
      "verify",
      "evidence",
      "pack",
    ]);
  });

  it("everything done when the records are complete", () => {
    expect(Object.values(state({}))).toEqual([
      "done",
      "done",
      "done",
      "done",
      "done",
    ]);
  });

  it("counts what's missing, with the action that fixes it", () => {
    const s = heldSteps({
      ...base,
      trackingMissing: 4,
      digitalNotCompleted: 1,
    });
    expect(s[0]).toMatchObject({
      state: "todo",
      action: { href: "/dashboard#tracking" },
    });
    expect(s[0].detail).toMatch(/^4 physical orders have no tracking/);
    expect(s[1].detail).toMatch(/^1 digital order isn't marked Completed/);
  });

  it("verification: unverified is a step to do; unreadable is unknown, never called unverified", () => {
    expect(state({ verification: "unverified" }).verify).toBe("todo");
    expect(state({ verification: "not_connected" }).verify).toBe("todo");
    const u = heldSteps({ ...base, verification: "unreadable" })[2];
    expect(u.state).toBe("unknown");
    expect(u.detail).toMatch(/doesn't mean it's unverified/);
  });

  it("a blocked or missing pack is a step to do", () => {
    expect(state({ latestPack: { id: "p", status: "blocked" } }).pack).toBe(
      "todo",
    );
    expect(state({ latestPack: null }).pack).toBe("todo");
    expect(heldSteps(base)[4].action).toEqual({
      label: "Open pack",
      href: "/packs/p1",
    });
  });

  it("never promises a release or speaks for PayPal's decision", () => {
    const text = [
      ...heldSteps({
        ...base,
        trackingMissing: 2,
        verification: "unverified",
        latestPack: null,
      }).flatMap((s) => [s.title, s.detail]),
      ...DONT,
    ].join(" ");
    expect(text).not.toMatch(
      /release|guarantee|will be (paid|freed|lifted)|unlock/i,
    );
  });
});
