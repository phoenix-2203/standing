// README screenshots (docs/screenshots/*.jpg) from the local app with the dev-only login. Dev badge hidden.
// Usage: node scripts/readme-shots.mjs [base-url]
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:3000";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
const p = await ctx.newPage();
await p.goto(`${base}/api/dev/session`);
const packs = await (await p.request.get(`${base}/api/packs`)).json();
const pack = (Object.values(packs).find(Array.isArray) ?? []).find((x) => x.status === "ready");
for (const [name, path] of [["dashboard", "/dashboard"], ["orders", "/orders"], ["pack", `/packs/${pack.id}`]]) {
  await p.goto(base + path, { waitUntil: "networkidle" });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await p.waitForFunction(() => !document.querySelector("[aria-busy=true]"), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(500);
  await p.screenshot({ path: `docs/screenshots/${name}.jpg`, type: "jpeg", quality: 85 });
}
await b.close();
console.log("docs/screenshots: dashboard, orders, pack");
