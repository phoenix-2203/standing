// Real screens for the public site: the dashboard (hero) and three crops (Watch, Fix, Prove), taken from the local
// app with the dev-only login and the sandbox account's synced data. Rerun after a screen's design changes.
// Usage: node scripts/site-images.mjs [base-url]
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const HIDE = "nextjs-portal{display:none!important}";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: "light", reducedMotion: "reduce" });
const p = await ctx.newPage();
await p.goto(`${base}/api/dev/session`);
if (!p.url().includes("/dashboard")) throw new Error("dev login failed");
const ready = async () => {
  await p.addStyleTag({ content: HIDE });
  await p.waitForFunction(() => !document.body.innerText.includes("Loading…"), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(500);
};

await p.goto(`${base}/dashboard`, { waitUntil: "networkidle" });
await ready();
await p.screenshot({ path: "public/site/hero-dashboard.png", clip: { x: 0, y: 0, width: 1280, height: 800 } });
const watch = p.locator("[data-shot=watch]").first();
await (await watch.count() ? watch : p.locator("section").nth(1)).screenshot({ path: "public/site/watch.png" });

await p.goto(`${base}/orders`, { waitUntil: "networkidle" });
await ready();
await p.locator(".ag-root-wrapper").first().screenshot({ path: "public/site/fix.png" });

const packs = await (await p.request.get(`${base}/api/packs`)).json();
const ready_ = (Object.values(packs).find(Array.isArray) ?? []).find((x) => x.status === "ready");
await p.goto(`${base}/packs/${ready_.id}`, { waitUntil: "networkidle" });
await ready();
const prove = p.locator("[data-shot=prove]").first();
await (await prove.count() ? prove : p.locator("section, article").first()).screenshot({ path: "public/site/prove.png" });
await b.close();
console.log("public/site: hero-dashboard, watch, fix, prove");
