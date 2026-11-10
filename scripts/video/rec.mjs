// Demo-video recorder: one scene = one clip of JPEG frames from Chrome's screencast (sharper than Playwright's
// built-in WebM), plus an on-screen cursor, highlight rings and captions injected into the page.
// Frames are written to <out>/<scene>/NNNNN.jpg with their timestamps; build.mjs turns them into video.
import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

export const BASE = process.env.BASE ?? "http://localhost:3000";
export const OUT = process.env.VIDEO_OUT ?? "/tmp/standing-video";

const OVERLAY_CSS = `
#rec-cursor{position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transition:transform .7s cubic-bezier(.4,0,.2,1);filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}
#rec-cursor.press svg{transform:scale(.85)}
#rec-ring{position:fixed;z-index:2147483646;pointer-events:none;border:3px solid #e8a33d;border-radius:12px;box-shadow:0 0 0 9999px rgba(15,20,18,.28);opacity:0;transition:all .45s cubic-bezier(.4,0,.2,1)}
#rec-cap{position:fixed;left:50%;bottom:36px;transform:translateX(-50%) translateY(12px);z-index:2147483647;pointer-events:none;max-width:1100px;background:rgba(18,24,21,.94);color:#f4f1ea;font:500 26px/1.35 Inter,system-ui,sans-serif;padding:14px 26px;border-radius:14px;opacity:0;transition:all .35s ease;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.25)}
#rec-cap.on{opacity:1;transform:translateX(-50%) translateY(0)}
#rec-cap b{color:#f2c46d;font-weight:600}
nextjs-portal{display:none!important}
`;

function installOverlay() {
  if (document.getElementById("rec-cursor")) return;
  const c = document.createElement("div");
  c.id = "rec-cursor";
  c.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const pos = window.__recCursor ?? { x: innerWidth * 0.6, y: innerHeight * 0.6 };
  c.style.transform = `translate(${pos.x}px,${pos.y}px)`;
  const r = document.createElement("div");
  r.id = "rec-ring";
  const cap = document.createElement("div");
  cap.id = "rec-cap";
  document.body.append(r, cap, c);
}

export async function launch() {
  return chromium.launch({ args: ["--force-color-profile=srgb", "--hide-scrollbars"] });
}

// A recording page at 1600×900 CSS px rendered at 1.2× (= 1920×1080 frames, like 120% browser zoom).
export async function newPage(browser, { login = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2, colorScheme: "light", permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  if (login) await page.goto(`${BASE}/api/dev/session`);
  await ctx.addInitScript(`(${(css) => {
    addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = css;
      document.head.append(s);
    });
  }})(${JSON.stringify(OVERLAY_CSS)})`);
  return page;
}

export async function ready(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForFunction(() => !document.body.innerText.includes("Loading…"), null, { timeout: 20000 }).catch(() => {});
  await page.evaluate(installOverlay);
  await page.evaluate(() => document.fonts.ready);
}

export async function go(page, path) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await ready(page);
}

// Start capturing frames; returns stop() which writes the frame list.
export async function record(page, scene) {
  const dir = `${OUT}/${scene}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frames = [];
  let n = 0;
  let cut = 0; // seconds removed by pause()/resume(), so the clip jumps ahead
  let paused = false;
  let cdp = null;
  // A fresh CDP session each time: a cross-site navigation swaps the renderer and ends the old screencast.
  const attach = async () => {
    cdp = await page.context().newCDPSession(page);
    const mine = cdp;
    mine.on("Page.screencastFrame", async (f) => {
      await mine.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
      if (paused || mine !== cdp) return;
      const file = `${String(n++).padStart(5, "0")}.jpg`;
      writeFileSync(`${dir}/${file}`, Buffer.from(f.data, "base64"));
      frames.push({ file, t: f.metadata.timestamp - cut });
    });
    await mine.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080 });
  };
  const detach = async () => {
    const old = cdp;
    cdp = null;
    await old?.send("Page.stopScreencast").catch(() => {});
    await old?.detach().catch(() => {});
  };
  await attach();
  // Nudge a repaint so the first frame arrives immediately.
  await page.evaluate(() => document.body.style.setProperty("--rec-nudge", String(Math.random())));
  let pausedAt = 0;
  const marks = {};
  // A named moment, in seconds of the finished clip (cuts removed); box is in 1920×1080 frame pixels.
  const mark = (name, box) => {
    marks[name] = { t: Date.now() / 1000 - cut };
    if (box) marks[name].box = box;
  };
  const stop = async () => {
    await page.evaluate(() => document.body.style.setProperty("--rec-nudge", String(Math.random())));
    await page.waitForTimeout(150);
    await detach();
    frames.push({ file: null, t: Date.now() / 1000 - cut });
    writeFileSync(`${dir}/frames.json`, JSON.stringify(frames));
    const t0 = frames[0]?.t ?? 0;
    const rel = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, { ...v, t: Math.round((v.t - t0) * 100) / 100 }]));
    writeFileSync(`${dir}/marks.json`, JSON.stringify(rel, null, 2));
    console.log(`${scene}: ${frames.length - 1} frames, ${(frames.at(-1).t - frames[0].t).toFixed(1)} s`);
  };
  // Cut: frames between pause() and resume() are dropped and the timeline closes the gap.
  stop.pause = () => {
    paused = true;
    pausedAt = Date.now() / 1000;
  };
  stop.resume = async () => {
    await detach();
    cut += Date.now() / 1000 - pausedAt - 0.04;
    paused = false;
    await attach();
    await page.evaluate(() => document.body?.style.setProperty("--rec-nudge", String(Math.random()))).catch(() => {});
  };
  stop.mark = mark;
  return stop;
}

// A locator's box in frame pixels (CSS px × the 1.2 device scale), with optional padding.
export async function frameBox(page, target, pad = 0) {
  const loc = typeof target === "string" ? page.locator(target).first() : target;
  const b = await loc.boundingBox();
  if (!b) return null;
  const k = 1.2;
  return { x: Math.round((b.x - pad) * k), y: Math.round((b.y - pad) * k), w: Math.round((b.width + pad * 2) * k), h: Math.round((b.height + pad * 2) * k) };
}

export const wait = (page, s) => page.waitForTimeout(s * 1000);

// Repaint every 100 ms while holding, so the screencast keeps an even timeline.
export async function hold(page, s) {
  const end = Date.now() + s * 1000;
  while (Date.now() < end) {
    await page.evaluate(() => document.body?.style.setProperty("--rec-nudge", String(Math.random()))).catch(() => {});
    await page.waitForTimeout(100);
  }
}

async function box(page, target) {
  const loc = typeof target === "string" ? page.locator(target).first() : target;
  await loc.scrollIntoViewIfNeeded();
  return loc.boundingBox();
}

export async function scrollTo(page, target, { block = "center", s = 1.2 } = {}) {
  const loc = typeof target === "string" ? page.locator(target).first() : target;
  await loc.evaluate((el, block) => {
    const r = el.getBoundingClientRect();
    const top = block === "start" ? r.top + scrollY - 96 : r.top + scrollY - (innerHeight - r.height) / 2;
    window.scrollTo({ top, behavior: "smooth" });
  }, block);
  await hold(page, s);
}

export async function scrollBy(page, y, s = 1.2) {
  await page.evaluate((y) => window.scrollBy({ top: y, behavior: "smooth" }), y);
  await hold(page, s);
}

export async function moveTo(page, target, s = 0.8) {
  const b = await box(page, target);
  if (!b) return null;
  const x = b.x + Math.min(b.width / 2, 60), y = b.y + b.height / 2;
  await page.evaluate(({ x, y }) => {
    window.__recCursor = { x, y };
    const c = document.getElementById("rec-cursor");
    if (c) c.style.transform = `translate(${x}px,${y}px)`;
  }, { x, y });
  await hold(page, s);
  return { x, y };
}

export async function click(page, target, { s = 0.5 } = {}) {
  const p = await moveTo(page, target);
  await page.evaluate(() => document.getElementById("rec-cursor")?.classList.add("press"));
  await hold(page, 0.12);
  await page.evaluate(() => document.getElementById("rec-cursor")?.classList.remove("press"));
  const loc = typeof target === "string" ? page.locator(target).first() : target;
  await loc.click();
  await hold(page, s);
  return p;
}

export async function type(page, target, text, { delay = 55 } = {}) {
  await click(page, target, { s: 0.2 });
  const loc = typeof target === "string" ? page.locator(target).first() : target;
  await loc.pressSequentially(text, { delay });
  await hold(page, 0.3);
}

export async function ring(page, target, { pad = 8, s = 1.5 } = {}) {
  const b = await box(page, target);
  if (!b) return;
  await page.evaluate(({ b, pad }) => {
    const r = document.getElementById("rec-ring");
    Object.assign(r.style, { left: `${b.x - pad}px`, top: `${b.y - pad}px`, width: `${b.width + pad * 2}px`, height: `${b.height + pad * 2}px`, opacity: "1" });
  }, { b, pad });
  await hold(page, s);
}

export async function unring(page) {
  await page.evaluate(() => {
    const r = document.getElementById("rec-ring");
    if (r) r.style.opacity = "0";
  });
  await hold(page, 0.3);
}

export async function caption(page, html) {
  if (process.env.CAPTIONS === "0") return; // raw footage: subtitles are added in the edit
  await page.evaluate((html) => {
    const c = document.getElementById("rec-cap");
    if (!c) return;
    if (!html) return c.classList.remove("on");
    c.innerHTML = html;
    c.classList.add("on");
  }, html);
  await hold(page, 0.2);
}
