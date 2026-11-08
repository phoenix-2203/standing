// Quick accessibility check: runs axe-core (WCAG 2.x A/AA rules) on the given paths, light and dark, and prints
// serious/critical violations. Usage: node scripts/axe.mjs / /dashboard ...
import { chromium } from "playwright";
import { createRequire } from "node:module";
const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const base = process.env.BASE ?? "http://localhost:3000";
const b = await chromium.launch();
let bad = 0;
for (const scheme of ["light", "dark"]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await p.goto(`${base}/api/dev/session`);
  for (const path of process.argv.slice(2)) {
    await p.goto(base + path, { waitUntil: "networkidle" });
    await p.waitForFunction(() => !document.querySelector("[aria-busy=true]"), null, { timeout: 15000 }).catch(() => {});
    await p.addScriptTag({ path: axePath });
    const r = await p.evaluate(async () =>
      // nextjs-portal is the dev-only overlay, not the app.
      (await window.axe.run({ exclude: [["nextjs-portal"]] }, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] })).violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        n: v.nodes.length,
        target: v.nodes.slice(0, 3).map((x) => x.target.join(" ")),
      })),
    );
    const serious = r.filter((v) => v.impact === "serious" || v.impact === "critical");
    bad += serious.length;
    console.log(`${scheme} ${path}: ${serious.length} serious/critical, ${r.length - serious.length} minor`);
    for (const v of r) console.log(`   ${v.impact} ${v.id} ×${v.n} ${JSON.stringify(v.target)}`);
  }
  await ctx.close();
}
await b.close();
process.exitCode = bad ? 1 : 0;
