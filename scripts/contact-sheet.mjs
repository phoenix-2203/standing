// One image per set: each page's top fold, desktop light/dark and phone light, for quick review.
// Usage: node scripts/contact-sheet.mjs <screens-dir> <out.png>
import { chromium } from "playwright";
import { readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [dir, out] = process.argv.slice(2);
const files = readdirSync(dir).filter((f) => f.endsWith(".png"));
const pages = [...new Set(files.map((f) => f.replace(/-(desktop|phone)-(light|dark)\.png$/, "")))];
const cell = (f, w, h) => `<div class="c"><img src="file://${resolve(dir, f)}" style="width:${w}px;height:${h}px"><span>${f.replace(".png", "")}</span></div>`;
const rows = pages
  .map((p) => {
    const want = [[`${p}-desktop-light.png`, 480, 300], [`${p}-desktop-dark.png`, 480, 300], [`${p}-phone-light.png`, 139, 300], [`${p}-phone-dark.png`, 139, 300]];
    return `<div class="r">${want.filter(([f]) => files.includes(f)).map(([f, w, h]) => cell(f, w, h)).join("")}</div>`;
  })
  .join("");
const html = `<html><body style="margin:0;padding:16px;background:#ddd;font:12px system-ui">
<style>.r{display:flex;gap:10px;margin-bottom:12px}.c{display:flex;flex-direction:column;gap:3px}img{object-fit:cover;object-position:top;border:1px solid #999;background:#fff}</style>${rows}</body></html>`;
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1300, height: 800 } });
const tmp = resolve(dir, "..", ".contact-sheet.html");
writeFileSync(tmp, html);
await pg.goto(`file://${tmp}`, { waitUntil: "load" });
await pg.screenshot({ path: out, fullPage: true });
await b.close();
(await import("node:fs")).unlinkSync(tmp);
console.log(out);
