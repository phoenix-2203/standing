import { describe, expect, it } from "vitest";
import type { Pack } from "./build";
import { renderPackPdf } from "./pdf";

const base: Pack = {
  id: "00000000-0000-0000-0000-000000000001",
  sellerId: "seller-1",
  periodFrom: new Date("2026-09-07T12:00:00Z"),
  periodTo: new Date("2026-11-06T12:00:00Z"),
  status: "ready",
  salesCurve: [
    { day: "2026-11-04", cents: 3800, orders: 2 },
    { day: "2026-11-05", cents: 0, orders: 0 },
  ],
  summaryEvidenceId: "EV-SUM-X",
  plan: null,
  letter: {
    paragraphs: [
      {
        sentences: [
          { kind: "bridge", text: "This letter explains recent activity on our account.", citations: [] },
          { kind: "fact", text: "PayPal payments received between 2026-09-07 and 2026-11-06: 2, totalling USD 38.00.", citations: ["EV-SUM-X"] },
        ],
      },
    ],
  },
  evidence: [{ id: "EV-SUM-X", kind: "sales_summary", summary: "Between 2026-09-07 and 2026-11-06 …", simulated: false }],
  facts: [],
  validation: { ok: true, problems: [] },
  attempts: 1,
  provider: "gemini",
  model: "m",
  createdAt: new Date("2026-11-06T12:00:00Z"),
};

describe("renderPackPdf", () => {
  it("renders a ready pack to a PDF", async () => {
    const pdf = await renderPackPdf(base);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it.each(["blocked", "draft"] as const)("refuses a %s pack", async (status) => {
    await expect(renderPackPdf({ ...base, status })).rejects.toThrow(/only a validated \(ready\) pack/);
  });

  it("refuses a ready-looking pack with no letter", async () => {
    await expect(renderPackPdf({ ...base, letter: null })).rejects.toThrow(/only a validated/);
  });
});
