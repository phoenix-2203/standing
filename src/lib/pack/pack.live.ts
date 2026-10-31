import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { evidenceItems } from "@/db/schema";
import { addTrafficSource } from "@/lib/evidence/ledger";
import { runCycle } from "@/lib/jobs/cycle";
import { providersFromEnv } from "@/lib/llm/providers";
import { paypalFromEnv } from "@/lib/paypal/client";
import { testDb } from "@/test/helpers";
import { buildPack } from "./build";
import { renderPackPdf } from "./pdf";

// Live pack on the PayPal sandbox data (npm run test:live -- src/lib/pack/pack.live.ts).
// Throwaway PGlite DB; the PDF goes to packs/out/ (git-ignored).
it("builds, validates and exports one pack from the sandbox", { timeout: 900_000 }, async () => {
  const db = await testDb();
  const cycle = await runCycle(db, paypalFromEnv(), "sandbox-seller");
  console.log("sync:", JSON.stringify(cycle.sync.map((s) => [s.job, s.ok, s.upserted, s.debugId ?? null])));
  // One seller-added item, clearly labelled, to show how simulated inputs appear in a pack.
  await addTrafficSource(db, "sandbox-seller", { label: "Demo: product video shared by the seller", url: "https://example.com/standing-demo-video", date: "2026-10-30", simulated: true });
  console.log("ledger items:", (await db.select().from(evidenceItems)).length);

  const pack = await buildPack(db, "sandbox-seller", providersFromEnv(), { days: 30 });
  console.log(JSON.stringify({ id: pack.id, status: pack.status, attempts: pack.attempts, provider: pack.provider, model: pack.model, problems: pack.validation?.problems }));
  console.log("plan:", JSON.stringify(pack.plan));
  for (const p of pack.letter?.paragraphs ?? []) console.log("¶", p.sentences.map((s) => `${s.text}${s.citations.length ? ` [${s.citations.join(", ")}]` : ""}`).join(" "));

  expect(pack.status).toBe("ready");
  mkdirSync("packs/out", { recursive: true });
  const file = `packs/out/live-pack-${pack.periodTo.toISOString().slice(0, 10)}.pdf`;
  writeFileSync(file, await renderPackPdf(pack));
  console.log("pdf:", file);
});
