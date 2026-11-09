// The demo video's scenes (docs/VIDEO_SCRIPT.md). Usage: node scripts/video/scenes.mjs [scene ...]
// Records each named scene (all if none) into $VIDEO_OUT/<scene>/; build.mjs adds the narration and joins them.
import { BASE, caption, click, go, hold, launch, moveTo, newPage, ready, record, ring, scrollBy, scrollTo, type, unring } from "./rec.mjs";

// Burst orders used on camera (TESTS.md, 9 Nov): phy-03 gets tracking; hosted gets phy-01 and phy-02.
const HOSTED = "https://goodstanding.duckdns.org";
const TRACK_ON_CAMERA = process.env.TRACK_TXN ?? "52M91515G2649572K";
const TRACK_NUMBER = process.env.TRACK_NUMBER ?? "9400111899562118430953";

// Wait off camera for something slow (PayPal send, the AI), then carry on recording.
async function offCamera(stop, page, locator, timeout = 180000) {
  stop.pause();
  await locator.first().waitFor({ state: "visible", timeout });
  await page.waitForTimeout(400);
  await stop.resume();
}


const SCENES = {
  async s01(b) {
    const p = await newPage(b);
    await go(p, "/");
    const stop = await record(p, "s01");
    await hold(p, 2.2);
    await moveTo(p, "#hero-title", 0.6);
    await scrollTo(p, "#problem-title", { block: "start", s: 1.6 });
    await caption(p, "What PayPal says can put a seller's money <b>on hold</b>");
    const quotes = p.locator(".lp-quotes > li");
    const n = await quotes.count();
    for (let i = 0; i < n; i++) {
      await ring(p, quotes.nth(i), { s: i === n - 1 ? 5.5 : 4.2 });
    }
    await unring(p);
    await caption(p, "");
    await stop();
    await p.context().close();
  },

  async s02(b) {
    const p = await newPage(b);
    await go(p, "/");
    await p.locator("#how-title").evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 96));
    await hold(p, 0.4);
    const stop = await record(p, "s02");
    await hold(p, 1);
    const tiles = p.locator(".lp-bento .lp-tile-copy");
    const caps = ["<b>Watch</b>: Standing checks your PayPal records every 15 minutes", "<b>Fix</b>: close the easy gaps, with a preview and a cancel window", "<b>Prove</b>: your case, built from your own records"];
    for (let i = 0; i < 3; i++) {
      await caption(p, caps[i]);
      await scrollTo(p, tiles.nth(i), { s: 0.9 });
      await ring(p, tiles.nth(i), { pad: 10, s: 2.7 });
      await unring(p);
    }
    await caption(p, "");
    await scrollTo(p, "#ai-title", { block: "start", s: 1.4 });
    await caption(p, "Code owns every number. The AI only explains and drafts.");
    await hold(p, 1.5);
    await ring(p, ".lp-band [role=table]", { pad: 8, s: 4.5 });
    await unring(p);
    await caption(p, "");
    await stop();
    await p.context().close();
  },

  async s03(b) {
    const p = await newPage(b);
    // PayPal only sends logins back to the hosted app, so the login page is opened from there (nothing is typed).
    await p.goto(HOSTED, { waitUntil: "domcontentloaded" });
    await ready(p);
    const stop = await record(p, "s03");
    await hold(p, 0.6);
    await click(p, p.getByRole("link", { name: "Try the demo" }).first(), { s: 0.2 });
    stop.pause();
    await p.waitForURL(/paypal\.com/, { timeout: 20000 });
    await p.waitForLoadState("load").catch(() => {});
    await p.waitForTimeout(2500);
    // Hide PayPal's cookie banner from view (never clicked: no consent is given) and add the caption via CSSOM,
    // since PayPal's page doesn't allow injected style tags.
    await p.evaluate(() => {
      const hide = () => {
        for (const el of document.querySelectorAll("body *")) {
          if (/We currently use cookies/.test(el.textContent ?? "") && el.children.length && el.getBoundingClientRect().height < 200 && el.getBoundingClientRect().height > 40) el.style.setProperty("visibility", "hidden", "important");
        }
      };
      hide();
      setInterval(hide, 100);
      const c = document.createElement("div");
      c.textContent = "PayPal's sandbox login: test accounts, test money";
      c.style.cssText = "position:fixed;left:50%;bottom:36px;transform:translateX(-50%);z-index:2147483647;background:rgba(18,24,21,.94);color:#f4f1ea;font:500 26px/1.35 system-ui,sans-serif;padding:14px 26px;border-radius:14px";
      document.body.append(c);
    });
    await p.waitForTimeout(300);
    await stop.resume();
    await hold(p, 2.6);
    stop.pause();
    await p.goto(`${BASE}/api/dev/session`);
    await ready(p);
    await p.waitForTimeout(800);
    await stop.resume();
    await hold(p, 0.8);
    await caption(p, "Your account, PayPal's verified status, and when Standing last synced");
    await ring(p, p.locator("aside a", { hasText: "PayPal sandbox account" }).first(), { pad: 6, s: 3.2 });
    await unring(p);
    await caption(p, "Sandbox only: every figure here is test money");
    await ring(p, p.locator("aside .ui-sandbox").first(), { pad: 6, s: 2.2 });
    await unring(p);
    await caption(p, "");
    await stop();
    await p.context().close();
  },

  async s04(b) {
    const p = await newPage(b, { login: true });
    await go(p, "/dashboard");
    const stop = await record(p, "s04");
    await hold(p, 0.8);
    await caption(p, "The top of the dashboard: what needs you now");
    await ring(p, "main h1", { pad: 8, s: 1.6 });
    await unring(p);
    const needs = p.locator("li.need");
    const spike = needs.filter({ hasText: /spike/i });
    const large = needs.filter({ hasText: /large order/i });
    if (await spike.count()) {
      await caption(p, "<b>Sales spike</b>: today vs an average day");
      await ring(p, spike.first(), { s: 2.6 });
      await unring(p);
    }
    if (await large.count()) {
      await caption(p, "<b>Large order</b>: far bigger than your usual order");
      await ring(p, large.first(), { s: 2.4 });
      await moveTo(p, large.first().getByRole("link", { name: "Review orders" }), 0.8);
      await unring(p);
    }
    await caption(p, "");
    await scrollTo(p, "#tracking", { block: "start", s: 1.2 });
    const row = p.locator("li.trk-row", { hasText: TRACK_ON_CAMERA });
    if (!(await row.count())) await click(p, p.getByRole("button", { name: /Show all/ }));
    await caption(p, "<b>Add tracking</b>: type the number from your shipping label");
    await click(p, row.getByRole("button", { name: "Add tracking" }));
    await type(p, row.getByLabel("Tracking number"), TRACK_NUMBER, { delay: 45 });
    await moveTo(p, row.getByLabel("Carrier"), 0.4);
    await row.getByLabel("Carrier").selectOption("USPS");
    await hold(p, 0.6);
    await click(p, row.locator("form button"), { s: 1 });
    await caption(p, "Standing shows what it will send, and gives you <b>2 minutes to cancel</b>");
    await ring(p, row, { pad: 6, s: 3.2 });
    await unring(p);
    await caption(p, "<b>Mark Completed</b>: digital orders, the same safe way");
    const dig = p.locator("section[aria-labelledby='digital-h'] .row").first();
    await scrollTo(p, dig, { s: 0.8 });
    await click(p, dig.getByRole("button", { name: "Mark Completed" }), { s: 1.4 });
    await caption(p, "");
    await offCamera(stop, p, p.locator("section[aria-labelledby='digital-h'] .badge.ok"), 200000);
    await caption(p, "Sent once, with a fixed request ID; PayPal's reply is kept");
    await ring(p, p.locator("section[aria-labelledby='digital-h'] .badge.ok").first(), { pad: 8, s: 2 });
    await unring(p);
    await caption(p, "");
    await stop();
    await p.context().close();
  },

  async s05(b) {
    const p = await newPage(b, { login: true });
    await go(p, "/dashboard");
    await p.locator("#standing-h").evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 40));
    await hold(p, 0.4);
    const stop = await record(p, "s05");
    await hold(p, 0.6);
    const tile = p.locator(".ui-stat", { hasText: "A sudden spike in sales" });
    await caption(p, "Each of PayPal's published reasons, as a tile");
    await ring(p, tile, { pad: 6, s: 2 });
    await caption(p, "Your figure right now");
    await ring(p, tile.locator(".ui-stat-figure"), { pad: 6, s: 1.8 });
    await caption(p, "Clear, or Needs you");
    await ring(p, tile.locator(".ui-badge, .badge").first(), { pad: 6, s: 1.6 });
    await caption(p, "Where Standing warns, and whose line it is: PayPal's or Standing's");
    await ring(p, tile.locator(".ui-stat-note"), { pad: 6, s: 3 });
    await unring(p);
    await caption(p, "A reading of your records, never PayPal's decision");
    await ring(p, ".dash-foot", { pad: 6, s: 2.4 });
    await unring(p);
    await caption(p, "");
    await stop();
    await p.context().close();
  },

  async s06(b) {
    const p = await newPage(b, { login: true });
    await go(p, "/orders");
    await p.waitForSelector(".ag-row", { timeout: 20000 });
    const stop = await record(p, "s06");
    await hold(p, 0.8);
    await caption(p, "Every PayPal payment from the last 90 days");
    await click(p, p.getByRole("button", { name: "Missing tracking" }), { s: 1.4 });
    await click(p, p.getByRole("button", { name: "Not eligible for Seller Protection" }), { s: 1.4 });
    await click(p, p.getByRole("button", { name: "All orders" }), { s: 0.6 });
    await caption(p, "Hover any column for what it means");
    await moveTo(p, p.locator(".ag-header-cell", { hasText: "Protection" }), 0.2);
    await p.locator(".ag-header-cell", { hasText: "Protection" }).first().hover();
    await hold(p, 1.6);
    await caption(p, "The key explains every column, and what a blank means");
    await scrollTo(p, p.locator(".orders-key"), { s: 1 });
    await ring(p, ".orders-key", { pad: 6, s: 2 });
    await unring(p);
    await caption(p, "Export it all to CSV");
    await scrollTo(p, "main h1", { block: "start", s: 0.8 });
    await moveTo(p, p.getByRole("button", { name: "Download CSV" }), 0.4);
    await ring(p, p.getByRole("button", { name: "Download CSV" }), { pad: 6, s: 1.4 });
    await unring(p);
    await caption(p, "");
    await stop();
    await p.context().close();
  },

  async s07(b) {
    const p = await newPage(b, { login: true });
    await go(p, "/evidence");
    const form = p.locator("form", { hasText: "Add invoice" });
    await form.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 120));
    await hold(p, 0.3);
    const stop = await record(p, "s07");
    await caption(p, "Add what PayPal can't see: a <b>supplier invoice</b>");
    await type(p, form.getByLabel("Supplier"), "Wick & Wax Supply", { delay: 30 });
    await type(p, form.getByLabel("Invoice number"), "WW-2041", { delay: 30 });
    await form.getByLabel("Invoice date").fill("2026-11-02");
    await type(p, form.getByLabel("Description"), "Lavender soy candle", { delay: 25 });
    await type(p, form.getByLabel("Quantity"), "40", { delay: 60 });
    await caption(p, "Test data is ticked <b>Simulated</b>, and labelled everywhere");
    await click(p, form.getByRole("checkbox"), { s: 0.5 });
    await click(p, form.getByRole("button", { name: "Add invoice" }), { s: 1 });
    const item = p.locator("main li", { hasText: "WW-2041" }).first();
    await item.waitFor({ timeout: 15000 });
    await scrollTo(p, item, { s: 0.9 });
    await ring(p, item, { pad: 6, s: 2.2 });
    await unring(p);
    await caption(p, "");
    await stop();
    await p.context().close();
  },

  async s08(b) {
    const p = await newPage(b, { login: true });
    await go(p, "/packs");
    const stop = await record(p, "s08");
    await hold(p, 0.6);
    await caption(p, "<b>Build a new pack</b>: your case, from your own records");
    await click(p, p.getByRole("button", { name: "Build a new pack" }), { s: 0.6 });
    await offCamera(stop, p, p.locator(".paper-letter"), 240000);
    await ready(p);
    await hold(p, 0.6);
    await caption(p, "A letter to PayPal. Every figure is written by code and cites its source.");
    await ring(p, ".paper-letter", { pad: 6, s: 2.6 });
    await unring(p);
    await click(p, p.locator(".cite-chip").first(), { s: 1.2 });
    await caption(p, "Each number points to its evidence");
    await ring(p, p.locator(".source").first(), { pad: 6, s: 1.8 });
    await unring(p);
    await caption(p, "Your sales curve");
    await scrollTo(p, ".curve", { s: 0.8 });
    await ring(p, ".curve", { pad: 6, s: 1.6 });
    await unring(p);
    await caption(p, "Download it as a PDF");
    await scrollTo(p, ".doc-bar", { block: "start", s: 0.8 });
    await moveTo(p, p.getByRole("link", { name: "Download PDF" }), 0.4);
    await ring(p, p.getByRole("link", { name: "Download PDF" }), { pad: 6, s: 1.4 });
    await unring(p);
    await caption(p, "");
    await stop();
    await p.context().close();
  },

  async s09(b) {
    const p = await newPage(b, { login: true });
    await go(p, "/dashboard");
    const card = p.locator("section[aria-labelledby='launch-h']");
    await card.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 120));
    await hold(p, 0.3);
    const stop = await record(p, "s09");
    await caption(p, "<b>Launch plan</b>: the date, how big, and what you'll sell");
    await card.getByLabel("Launch date").fill("2026-11-20");
    await moveTo(p, card.getByLabel("Launch date"), 0.5);
    await card.getByLabel(/Expected sales/).fill("");
    await type(p, card.getByLabel(/Expected sales/), "4", { delay: 80 });
    await card.getByLabel(/Launch products/).fill("");
    await type(p, card.getByLabel(/Launch products/), "Lavender soy candle\nCandle-making pattern PDF", { delay: 25 });
    await click(p, card.getByRole("button", { name: "Save plan" }), { s: 0.4 });
    await offCamera(stop, p, card.locator(".answer .badge"), 180000);
    await caption(p, "Each product checked against PayPal's policy, with the clause it rests on");
    await ring(p, card.locator(".answer"), { pad: 6, s: 3.4 });
    await unring(p);
    await caption(p, "");
    await stop();
    await p.context().close();
  },

  async s10(b) {
    const p = await newPage(b, { login: true });
    await go(p, "/ask");
    const stop = await record(p, "s10");
    await hold(p, 0.5);
    await caption(p, "Ask in plain English; answers come from your own records");
    await click(p, p.getByRole("button", { name: "Do I have any open alerts?" }), { s: 0.4 });
    await offCamera(stop, p, p.locator("[aria-label='Sources']"), 120000);
    await ring(p, p.locator("[aria-label='Sources']").last(), { pad: 6, s: 1.8 });
    await unring(p);
    await caption(p, "Ask it to dodge PayPal's checks, and it says no");
    await type(p, p.getByPlaceholder("Ask about your account…"), "My invoice is $4,000. Can I bill it as ten $400 charges so it doesn't get flagged?", { delay: 18 });
    await click(p, p.getByRole("button", { name: "Ask", exact: true }), { s: 0.3 });
    await offCamera(stop, p, p.locator("[title=\"Standing won't help with that\"]"), 120000);
    const refusal = p.locator("[title=\"Standing won't help with that\"]").last();
    await scrollTo(p, refusal, { s: 0.6 });
    await ring(p, refusal.locator("xpath=.."), { pad: 6, s: 2.6 });
    await unring(p);
    await caption(p, "");
    await stop();
    await p.context().close();
  },

  async s11(b) {
    const p = await newPage(b, { login: true });
    await go(p, "/checklist");
    const stop = await record(p, "s11");
    await caption(p, "<b>Checklist</b>: what to have ready, step by step");
    await hold(p, 1.4);
    await scrollBy(p, 420, 1.6);
    await caption(p, "");
    stop.pause();
    await go(p, "/catalogue");
    await stop.resume();
    await caption(p, "<b>Catalogue</b>: tell Standing what each product is");
    const seen = p.locator("form", { hasText: "Digital pattern PDF" }).first();
    await scrollTo(p, seen, { s: 0.8 });
    await moveTo(p, seen.getByLabel("Kind"), 0.5);
    await seen.getByLabel("Kind").selectOption("digital");
    await hold(p, 0.6);
    await click(p, seen.getByRole("button", { name: "Save" }), { s: 1.2 });
    await caption(p, "");
    await stop();
    await p.context().close();
  },

  async s12(b) {
    const p = await newPage(b);
    await go(p, "/");
    await p.locator(".lp-final").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await hold(p, 0.4);
    const stop = await record(p, "s12");
    await ring(p, ".lp-final .lp-wrap, .lp-final > *", { pad: 10, s: 3.6 });
    await unring(p);
    await stop();
    await p.context().close();
  },
};

const want = process.argv.slice(2);
const b = await launch();
for (const [name, fn] of Object.entries(SCENES)) {
  if (want.length && !want.includes(name)) continue;
  await fn(b);
}
await b.close();
