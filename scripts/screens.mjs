// Captures every page at desktop and phone width, light and dark, for the redesign's before/after record.
// Usage: node scripts/screens.mjs <out-dir> [base-url]. Needs the local dev server with STANDING_DEV_LOGIN=1.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const out = process.argv[2];
const base = process.argv[3] ?? "http://localhost:3000";
if (!out) throw new Error("usage: node scripts/screens.mjs <out-dir> [base-url]");
mkdirSync(out, { recursive: true });

const sizes = [
  ["desktop", 1440, 900],
  ["phone", 390, 844],
];
const schemes = ["light", "dark"];

const browser = await chromium.launch();
// Public pages first, without a session.
const pub = [["home", "/"], ["styleguide", "/styleguide"], ["trust", "/trust"], ["privacy", "/privacy"], ["terms", "/terms"], ["not-found", "/no-such-page"]];

// Logged-in pages via the dev-only login (404 in production).
const login = await browser.newContext();
const lp = await login.newPage();
const res = await lp.goto(`${base}/api/dev/session`);
if (!res || !lp.url().includes("/dashboard")) throw new Error("dev login failed; is STANDING_DEV_LOGIN=1 set?");
const packs = await (await lp.request.get(`${base}/api/packs`)).json();
const list = Object.values(packs).find(Array.isArray) ?? [];
const ready = list.find((p) => p.status === "ready");
const state = await login.storageState();
await login.close();

const app = [
  ["dashboard", "/dashboard"],
  ["orders", "/orders"],
  ["catalogue", "/catalogue"],
  ["evidence", "/evidence"],
  ["packs", "/packs"],
  ...(ready ? [["pack-view", `/packs/${ready.id}`]] : []),
  ["checklist", "/checklist"],
  ["launch", "/launch"],
  ["ask", "/ask"],
];

let n = 0;
for (const [label, w, h] of sizes)
  for (const scheme of schemes)
    for (const [pages, storageState] of [[pub, undefined], [app, state]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, storageState, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      for (const [name, path] of pages) {
        const r = await page.goto(base + path, { waitUntil: "networkidle" });
        if (r && r.status() === 404 && name !== "not-found") continue; // page doesn't exist (yet)
        await page.waitForFunction(() => !document.body.innerText.includes("Loading…"), null, { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${out}/${name}-${label}-${scheme}.png`, fullPage: true });
        n++;
      }
      await ctx.close();
    }
await browser.close();
console.log(`${n} screenshots in ${out}`);
