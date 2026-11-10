// Raw app clips for the film (video/CLIPS_FOR_FILM.md): no captions, no audio, 1.5 s still handles at both ends.
// Usage: CAPTIONS=0 FFMPEG=/path/to/ffmpeg node scripts/video/clips.mjs [clip ...]
// Writes video/clips/<name>.mp4 (H.264, CRF 16, 30 fps) and video/clips/<name>.json (marks: seconds + frame boxes).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { click, frameBox, go, hold, launch, moveTo, newPage, OUT, ready, record, ring, scrollTo, type, unring } from "./rec.mjs";

const CLIPS_DIR = "video/clips";
const FF = process.env.FFMPEG ?? "ffmpeg";
const HANDLE = 1.5;
const TRACK_TXN = process.env.TRACK_TXN ?? "52M91515G2649572K"; // burst order phy-03 (TESTS.md, 9 Nov)
const TRACK_NUMBER = "9400111899562118430953";

async function offCamera(stop, page, locator, timeout = 180000) {
  stop.pause();
  await locator.first().waitFor({ state: "visible", timeout });
  await page.waitForTimeout(500);
  await stop.resume();
}

const CLIPS = {
  async v_home(b) {
    const p = await newPage(b);
    await go(p, "/");
    const stop = await record(p, "v_home");
    await hold(p, HANDLE + 2);
    await scrollTo(p, "#try-title", { block: "start", s: 1.6 });
    stop.mark("tool");
    const normal = p.getByLabel("A normal day's sales (USD)");
    const today = p.getByLabel("Today's sales (USD)");
    await normal.fill("");
    await today.fill("");
    await p.getByLabel(/Largest single order/).fill("");
    await hold(p, 0.4);
    await type(p, normal, "120", { delay: 110 });
    await type(p, today, "480", { delay: 110 });
    stop.mark("typed");
    await hold(p, 0.6);
    stop.mark("result", await frameBox(p, ".spike-result", 8));
    await ring(p, ".spike-result", { s: 3 });
    await unring(p);
    await hold(p, HANDLE);
    await stop();
    await p.context().close();
  },

  async v_connect(b) {
    const p = await newPage(b, { login: true });
    await go(p, "/");
    const stop = await record(p, "v_connect");
    await hold(p, HANDLE);
    const cta = p.getByRole("link", { name: "Try the demo" }).first();
    await moveTo(p, cta, 0.8);
    stop.mark("click");
    // Cut before PayPal's login page: the dashboard is opened with the session already in place.
    await p.evaluate(() => document.getElementById("rec-cursor")?.classList.add("press"));
    await hold(p, 0.15);
    stop.pause();
    await go(p, "/dashboard");
    await p.waitForTimeout(600);
    await stop.resume();
    stop.mark("dash");
    await hold(p, 1.2);
    const panel = p.locator("aside a", { hasText: "PayPal sandbox account" }).first();
    stop.mark("verified", await frameBox(p, panel, 6));
    await ring(p, panel, { pad: 6, s: 2.5 });
    await unring(p);
    await hold(p, HANDLE);
    await stop();
    await p.context().close();
  },

  async v_dashboard(b) {
    const p = await newPage(b, { login: true });
    await go(p, "/dashboard");
    const stop = await record(p, "v_dashboard");
    await hold(p, HANDLE);
    stop.mark("needs");
    await hold(p, 0.8);
    const needs = p.locator("li.need");
    const spike = needs.filter({ hasText: /spike/i });
    if (await spike.count()) {
      stop.mark("spike", await frameBox(p, spike.first(), 8));
      await ring(p, spike.first(), { s: 2.5 });
      await unring(p);
    } else console.log("v_dashboard: no sales-spike card on the dashboard (spike below Standing's 3× line)");
    const large = needs.filter({ hasText: /large order/i });
    if (await large.count()) {
      stop.mark("large", await frameBox(p, large.first(), 8));
      await ring(p, large.first(), { s: 2.5 });
      await unring(p);
    }
    await scrollTo(p, "#standing-h", { block: "start", s: 1.4 });
    stop.mark("stand");
    const tile = p.locator(".ui-stat", { hasText: "A sudden spike in sales" });
    stop.mark("spike_tile", await frameBox(p, tile, 6));
    await ring(p, tile, { pad: 6, s: 2 });
    await unring(p);
    stop.mark("threshold", await frameBox(p, tile.locator(".ui-stat-note"), 4));
    await moveTo(p, tile.locator(".ui-stat-note"), 0.8);
    await tile.locator(".ui-stat-note").hover();
    await hold(p, 1.5 + HANDLE);
    await stop();
    await p.context().close();
  },

  async v_fix(b) {
    const p = await newPage(b, { login: true });
    await go(p, "/dashboard");
    await p.locator("#tracking").evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 40));
    const row = p.locator("li.trk-row", { hasText: TRACK_TXN });
    if (!(await row.count())) {
      await p.getByRole("button", { name: /Show all/ }).click();
      await p.waitForTimeout(300);
    }
    await row.scrollIntoViewIfNeeded();
    await p.evaluate(() => window.scrollBy(0, 120));
    await ready(p);
    const stop = await record(p, "v_fix");
    await hold(p, HANDLE);
    await click(p, row.getByRole("button", { name: "Add tracking" }));
    stop.mark("open");
    await type(p, row.getByLabel("Tracking number"), TRACK_NUMBER, { delay: 45 });
    await moveTo(p, row.getByLabel("Carrier"), 0.4);
    await row.getByLabel("Carrier").selectOption("USPS");
    await hold(p, 0.5);
    stop.mark("typed");
    await click(p, row.locator("form button"), { s: 0.8 });
    await row.getByRole("button", { name: /Cancel \(/ }).waitFor({ timeout: 15000 });
    stop.mark("preview", await frameBox(p, row, 6));
    await ring(p, row, { pad: 6, s: 2 });
    await unring(p);
    stop.mark("countdown", await frameBox(p, row.getByRole("button", { name: /Cancel \(/ }), 6));
    await moveTo(p, row.getByRole("button", { name: /Cancel \(/ }), 0.4);
    await hold(p, 3);
    // Off camera until PayPal answers; the dashboard then reloads and this order leaves the list.
    stop.pause();
    const deadline = Date.now() + 200000;
    let sentBadge = false;
    while (Date.now() < deadline) {
      if (await row.locator(".badge.ok").count()) { sentBadge = true; break; }
      if (!(await row.count())) break;
      await p.waitForTimeout(1000);
    }
    // PayPal's answer as Standing stored it: the order's row in Orders, with the tracking number and Fix "Sent".
    await go(p, "/orders");
    await p.getByPlaceholder(/Search payment ID/).fill(TRACK_TXN);
    await p.waitForTimeout(1200);
    await stop.resume();
    stop.mark("sent");
    await hold(p, 0.8);
    const gridRow = p.locator(".ag-row:not(.ag-row-pinned)").first();
    stop.mark("answer", await frameBox(p, gridRow, 6));
    await ring(p, gridRow, { pad: 6, s: 3 });
    await unring(p);
    await hold(p, HANDLE);
    await stop();
    console.log(`v_fix: ${sentBadge ? "saw Sent to PayPal on the dashboard" : "row left the dashboard list after sending"}`);
    await p.context().close();
  },

  async v_pack(b) {
    const p = await newPage(b, { login: true });
    await go(p, "/packs");
    const stop = await record(p, "v_pack");
    await hold(p, HANDLE);
    await click(p, p.getByRole("button", { name: "Build a new pack" }), { s: 0.4 });
    await offCamera(stop, p, p.locator(".paper-letter"), 240000);
    await ready(p);
    stop.mark("built");
    await hold(p, 1.5);
    const chip = p.locator(".cite-chip", { hasText: /^3$/ }).first();
    await moveTo(p, chip, 0.6);
    stop.mark("cite");
    await click(p, chip, { s: 0.9 });
    const ev = p.locator("#ev-3");
    stop.mark("evidence", await frameBox(p, ev, 6));
    await ring(p, ev, { pad: 6, s: 2 });
    await unring(p);
    await scrollTo(p, ".curve", { s: 1 });
    stop.mark("curve", await frameBox(p, ".curve", 6));
    await hold(p, 2);
    await scrollTo(p, ".doc-bar", { block: "start", s: 1 });
    const pdf = p.getByRole("link", { name: "Download PDF" });
    await moveTo(p, pdf, 0.6);
    await pdf.hover();
    stop.mark("pdf", await frameBox(p, pdf, 6));
    await hold(p, 1 + HANDLE);
    await stop();
    await p.context().close();
  },

  async v_ask(b) {
    const p = await newPage(b, { login: true });
    await go(p, "/ask");
    const stop = await record(p, "v_ask");
    await hold(p, HANDLE);
    await click(p, p.getByRole("button", { name: "Do I have any open alerts?" }), { s: 0.4 });
    await offCamera(stop, p, p.locator(".chat-turn .chat-a:not(.chat-thinking)"), 150000);
    const answer = p.locator(".chat-turn .chat-a:not(.chat-thinking)").last();
    await scrollTo(p, answer, { s: 0.6 });
    stop.mark("answer", await frameBox(p, answer, 6));
    await ring(p, answer, { pad: 6, s: 2.5 });
    await unring(p);
    await type(p, p.getByPlaceholder("Ask about your account…"), "My invoice is $4,000. Can I bill it as ten $400 charges so it doesn't get flagged?", { delay: 22 });
    stop.mark("typed");
    await click(p, p.getByRole("button", { name: "Ask", exact: true }), { s: 0.3 });
    const refusalMark = p.locator(".chat-a-plain", { hasText: "Standing won't help with that" });
    await offCamera(stop, p, refusalMark, 150000);
    const refusal = refusalMark.last();
    await scrollTo(p, refusal, { s: 0.6 });
    stop.mark("refusal", await frameBox(p, refusal, 6));
    await ring(p, refusal, { pad: 6, s: 3 });
    await unring(p);
    await hold(p, HANDLE);
    await stop();
    await p.context().close();
  },

  async v_orders(b) {
    const p = await newPage(b, { login: true });
    await go(p, "/orders");
    await p.waitForSelector(".ag-row", { timeout: 20000 });
    const stop = await record(p, "v_orders");
    await hold(p, HANDLE + 0.5);
    stop.mark("views");
    await click(p, p.getByRole("button", { name: "Missing tracking" }), { s: 1.6 });
    await click(p, p.getByRole("button", { name: "All orders" }), { s: 1 });
    const totals = p.locator(".ag-grid-pinned-bottom-rows-container").first();
    await hold(p, 0.8);
    await totals.waitFor();
    await scrollTo(p, totals, { s: 1 });
    stop.mark("totals", await frameBox(p, totals, 6));
    await ring(p, totals, { pad: 6, s: 2.5 });
    await unring(p);
    await scrollTo(p, "main h1", { block: "start", s: 0.8 });
    const csv = p.getByRole("button", { name: "Download CSV" });
    await moveTo(p, csv, 0.6);
    await csv.hover();
    stop.mark("csv", await frameBox(p, csv, 6));
    await hold(p, 1 + HANDLE);
    await stop();
    await p.context().close();
  },
};

// Frames → constant 30 fps H.264 (CRF 16), no audio track.
function encode(name) {
  const dir = `${OUT}/${name}`;
  const frames = JSON.parse(readFileSync(`${dir}/frames.json`, "utf8"));
  const lines = [];
  for (let i = 0; i < frames.length - 1; i++) lines.push(`file '${dir}/${frames[i].file}'`, `duration ${Math.max(0.001, frames[i + 1].t - frames[i].t).toFixed(4)}`);
  lines.push(`file '${dir}/${frames.at(-2).file}'`);
  writeFileSync(`${dir}/list.txt`, lines.join("\n"));
  const len = frames.at(-1).t - frames[0].t;
  execFileSync(FF, ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`, "-vf", "scale=1920:1080:flags=lanczos,fps=30,format=yuv420p", "-t", len.toFixed(2), "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-movflags", "+faststart", `${CLIPS_DIR}/${name}.mp4`]);
  const marks = JSON.parse(readFileSync(`${dir}/marks.json`, "utf8"));
  writeFileSync(`${CLIPS_DIR}/${name}.json`, JSON.stringify({ clip: `${name}.mp4`, duration: Math.round(len * 100) / 100, frame: { w: 1920, h: 1080 }, marks }, null, 2));
  console.log(`${name}: ${len.toFixed(1)} s`);
}

mkdirSync(CLIPS_DIR, { recursive: true });
const want = process.argv.slice(2);
const b = await launch();
for (const [name, fn] of Object.entries(CLIPS)) {
  if (want.length && !want.includes(name)) continue;
  await fn(b);
  encode(name);
}
await b.close();
