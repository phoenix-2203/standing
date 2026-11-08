// After-screenshots for the redesign: desktop and phone, light only (dev badge hidden). Logs in with the dev-only
// route for app pages. Usage: node scripts/after-shots.mjs <name>=<path> [...]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.BASE ?? "http://localhost:3000";
const out = "docs/screens/after";
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const errors = [];
for (const [label, w, h] of [["desktop", 1440, 900], ["phone", 390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: "light", reducedMotion: "reduce" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${label}: ${e}`));
  await p.goto(`${base}/api/dev/session`);
  for (const arg of process.argv.slice(2)) {
    const [name, path] = arg.split("=");
    await p.goto(base + path, { waitUntil: "networkidle" });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await p.waitForFunction(() => !document.body.innerText.includes("Loading…"), null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${out}/${name}-${label}-light.png`, fullPage: true });
  }
  await ctx.close();
}
await b.close();
console.log(errors.length ? errors.join("\n") : "no page errors");
