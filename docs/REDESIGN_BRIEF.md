# Standing: redesign brief ("make it look like a product thousands of sellers already use")

Written 7 Nov 2026 from research on how the best fintech and SaaS products present themselves (sources at the
end). This is a **presentation pass**: the engine, numbers, APIs, honesty rules and tests stay as they are.
Read CLAUDE.md first; every hard rule there still applies and wins over anything here.

**Deadline discipline:** finish by **Mon 9 Nov, 18:00 Lagos**. Monday evening's demo orders and the README
screenshots depend on it, and the video is Tuesday. If a phase runs late, ship what's done and skip the rest;
never leave a half-redesigned screen.

---

## 1. What "top product" means here (research findings → Standing)

The best fintech sites (Stripe, Mercury, Ramp, Wise, Linear) share a handful of moves. Learn the principles;
**never copy their layouts, illustrations, copy, gradients or assets**, and never show their logos.

| What the best do | Source pattern | How Standing applies it |
|---|---|---|
| Headline names a **pain**, not a feature; subhead names the **audience**; **one** primary CTA | Fintech hero pattern | "Your best week shouldn't be the week your money gets held." / "For small sellers on PayPal." / one button |
| **Show the real product**, not an abstract picture | Mercury | Hero shows a real Standing screen rendered from seed data, labelled "Sandbox" |
| **Specific numbers**, with the math behind them | Ramp | Proof strip: "469 tests · 92% on a held-out set we didn't tune · 30/30 live sandbox orders". Each links to TESTS.md |
| **Let visitors feel the value before signing up** | Wise's calculator | A no-login **"Would this spike stand out?"** tool on the landing page (see §3.3) |
| **Trust as a destination**: a real security/trust page, linked from several places | Trust-pattern research | `/trust`: what we read from PayPal, what we store, sandbox-only, which AI providers, what the AI can't do, open source |
| Be **honest about status**. Silence reads worse than honesty; never fabricate logos, counts or testimonials | Same | "Hackathon project · PayPal sandbox only · not affiliated with PayPal" stated plainly, near the CTA, not buried |
| **Motion restraint**: hover and focus feedback plus fade-in on scroll; no parallax, counters or video; respect reduced motion | Stripe analysis + trust research | Same |
| **One product font, one body font**; tight negative tracking on big headlines | Stripe analysis | Keep the current Newsreader (display) + Inter (UI) + JetBrains Mono (figures) and refine sizes; no new fonts |
| Short, confident labels; no filler adjectives | Stripe microcopy | "Connect PayPal", "Build pack", "Add tracking", not "Click here to get started now!" |
| Dashboards: the **5-second test**: the most decision-relevant thing is the biggest | Dashboard UX research | Top of dashboard = one status sentence + count of things that need the seller |
| **Empty states designed as carefully as full ones**: what this is, why it's empty, one next action | Same | Every list and table gets one (orders, packs, evidence, signals, Ask) |
| Errors and outages shown **per component**, so the rest stays trusted | Same | "Couldn't reach PayPal just now; showing data from 14:05" on the card, not a blank page |

**What NOT to borrow:** compliance badges we don't hold (no SOC 2, PCI or "bank-grade" claims), customer logos,
testimonials, user counts or "trusted by" lines. Standing has no users yet, and saying so is part of the brand.
"Thousands of users" is the *look*, never a claim.

---

## 2. Design system (do this first; everything else uses it)

Keep "The Record" identity (pine and paper, serif headings, mono figures, the standing-figure logo), but make it
systematic:

- **Tokens** in `globals.css`:
  - colour roles: bg, surface, raised, ink, muted, line, accent, accent-ink, ok, warn, bad, info, plus a `-bg` for each;
  - spacing on a 4 px scale (4, 8, 12, 16, 24, 32, 48, 64, 96);
  - radii 6, 10 and 16; two shadows; durations 120 ms and 200 ms;
  - type scale: 12, 13, 15, 17, 20, 24, 32, 44, 60. Display headings get −0.02em tracking, and figures use `font-variant-numeric: tabular-nums`.
  - Light and dark must both pass **WCAG 2.2 AA** contrast.
- **Components** in `src/components/ui/`:
  - Button (primary, secondary, ghost, danger; sm and md; loading state);
  - Card, with optional header, action and footer;
  - Badge (neutral, ok, warn, bad, info, **simulated**);
  - Stat tile (label, figure, sub-line, optional delta);
  - PageHeader (title, one-line description, primary action);
  - EmptyState (icon, title, one sentence, one action);
  - Skeleton;
  - Callout (info, warn, bad);
  - Toast, for the result of an action, with PayPal's response ID when there is one;
  - ConfirmDialog, for destructive actions, accessible with focus trap and Esc;
  - Tabs;
  - Field (label, hint, error), Input, Select, Textarea, Checkbox;
  - KeyValue list;
  - Timeline, for the fix queue states.

  Replace the ad-hoc classes as screens are touched. Don't rewrite everything up front.
- **Formatting helpers**, used everywhere:
  - money with `Intl.NumberFormat` and currency code;
  - dates as "7 Nov 2026, 14:05" with relative time in a tooltip;
  - ratios as "14.2×".
  - IDs in mono, truncated in the middle, with a copy button.
- **Icons:** one set only (`lucide-react`, MIT), 16 and 20 px, stroke 1.75. No emoji in the UI.
- **The Simulated badge and the Sandbox tag** are first-class components, styled consistently everywhere they appear.

---

## 3. Public site (what a judge sees first)

### 3.1 Structure of `/` (in this order)
1. **Sticky header:** logo, then "How it works · Trust · GitHub", then a **Connect PayPal** button. The Sandbox tag is visible.
2. **Hero:**
   - pain headline, audience subhead, one primary CTA ("Try the sandbox demo"), and a secondary text link ("Watch the 3-minute video" once it exists, otherwise "See how it works");
   - a status line under the CTA: "Hackathon project · PayPal sandbox only, test money · not affiliated with PayPal";
   - on the right, a real product screenshot (the dashboard rendered from seed data), framed like an app window, with a small "Sandbox data" label.
3. **Proof strip:** three or four specific, linked numbers from TESTS.md and README (tests passing, held-out score, live sandbox checks). Pull the numbers from one constants file, so they're updated in one place.
4. **The problem, in PayPal's own words:** three short quotes from PayPal's help pages, each with a source link (already in the README). Keep each quote under 15 words.
5. **How it works:** three steps: **Watch** (signals), **Fix** (safe queue), **Prove** (pack). Each has a real UI crop, not an illustration.
6. **"Would this spike stand out?"**: the interactive tool (§3.3).
7. **Where the AI stops:** the code-vs-AI table, styled as a clean two-column comparison. This is the innovation story.
8. **Safe fixes:** the four-step flow (preview → 2-minute window → one send → PayPal's answer kept).
9. **Honest results:** the held-out table, including the misses, linking to TESTS.md.
10. **FAQ:** 6 questions:
    - Is this affiliated with PayPal?
    - Does it move money?
    - What does the AI see?
    - What if PayPal still holds my funds?
    - Why sandbox only?
    - Is it open source?
11. **Final CTA**, then the footer: links to Trust, Privacy, Terms, GitHub and the MIT licence; "Not affiliated with PayPal. PayPal is a trademark of its owner."; and the build date.

### 3.2 `/trust`, `/privacy`, `/terms`
Plain, short and true. `/trust` lists:
- what Standing reads from PayPal, with the exact API names;
- what it stores and for how long;
- what it never does (no live money; it never sends anything without the preview and cancel window);
- the AI providers it uses and what they receive;
- the AI's limits;
- how to report a problem.

No certifications. `/privacy` and `/terms` are a short demo-project notice, not legal boilerplate pretending to be a company.

### 3.3 "Would this spike stand out?" (no login)
- Two inputs: "a normal day's sales" and "today's sales", plus an optional "largest single order".
- The result is computed **by the same code** as the dashboard (`computeMetrics` / alert rules), not reimplemented: spike ratio, whether Standing would raise a signal, and the same plain-words message the dashboard uses.
- Footnote: "Standing's thresholds, not PayPal's. PayPal doesn't publish its own."
- No AI and no network calls to PayPal. Tests: the tool's output matches `evaluate()` for the same inputs.

### 3.4 Meta
`<title>` and description per page, an Open Graph image (use `docs/devpost/1-cover.png` as the base), favicon set, and a `theme-color`. Every page needs a proper 404 and 500.

---

## 4. The app

### 4.1 Shell
- **Desktop:** a left sidebar with logo, then Dashboard, Orders, Evidence, Packs, Launch plan, Ask Standing and Checklist. At the bottom: the account chip (PayPal account, verified/unverified badge, last synced, Log out) and the Sandbox tag.
- **Mobile (≤ 768 px):** a top bar with a menu button opening the same list as a sheet.
- The current page is marked in the nav (`aria-current`). Skip-to-content link.
- A persistent but quiet sandbox notice in the shell.

### 4.2 Dashboard (5-second test)
1. **Status line** at the top, written by code: "2 things need you" or "Nothing needs you right now · last checked 14:05", with the PageHeader action "Build pack".
2. **Needs you:** signals and fixes as actionable cards, most severe first, each with its numbers and one action.
3. **Where you stand:** stat tiles (spike ratio, average order change, tracking coverage, digital not Completed, 90-day dispute rate), each with a one-line meaning and the threshold note. Use a sparkline only where the data exists.
4. **Your case:** latest pack status, evidence count, and launch plan state.
5. **Ask Standing:** a compact entry point with 3 suggested questions.

Loading shows skeletons with the final layout. Errors show per card. A new seller sees a designed empty state ("Your first sale was 6 days ago…"), not dashes.

### 4.3 Other screens
- **Orders (AG Grid):** a custom theme on the design tokens (header, row height 40, zebra off, hover, focus ring), the quick views as Tabs, totals in the PageHeader, CSV export as a secondary button, and an empty state.
- **Packs:** a list with status badges. The pack view reads like a **document**: paper card, serif letter, numbered citations that scroll to and highlight their evidence, the sales curve, and a sticky "Download PDF" button. Blocked packs show why in plain words, plus a "Try again" button.
- **Evidence:** forms inside Cards, the Simulated checkbox as a styled toggle, the list as a Timeline.
- **Launch plan:** a form on the left and the result on the right (policy verdict per product, pack readiness, the pre-approval draft button).
- **Ask Standing:** a chat layout. Answers show their facts as citation chips; a refusal is a distinct, calm Callout with the fixed reason text; suggested questions appear as chips.
- **Fix queue (wherever fixes appear):** a Timeline showing Preview → Waiting (countdown) → Sent → PayPal's answer (debug ID with a copy button). Cancel is a clear secondary button.
- **Every action:** the button shows its loading state, then a toast with the result. Destructive actions use ConfirmDialog.

---

## 5. Non-negotiables

- **No logic changes.** Don't change metrics, thresholds, validators, the fix queue, API routes or the eval prompts. A UI change that needs a new field is wrong: use what the API already returns. Bug fixes found along the way go in separate `fix:` commits.
- **Honesty:**
  - "Simulated" and "Sandbox" stay visible wherever they apply now;
  - nothing claims what PayPal will decide;
  - no fabricated social proof, user counts, logos, badges or testimonials;
  - numbers on the public site come from a single constants file, each with a link to its source.
- **No third-party trademarks** in visuals: no PayPal logo image (the text "Log in with PayPal" is fine), no other brands' logos. The video is recorded from these screens.
- **Accessibility:**
  - WCAG 2.2 AA contrast in both themes;
  - visible focus;
  - full keyboard use;
  - labels on every input;
  - `prefers-reduced-motion` respected;
  - axe finds no serious or critical issues on any page.
- **Performance:** a Lighthouse score of 90 or more on `/` for Performance, Accessibility and Best Practices. Images in `next/image`. No heavy animation libraries.
- **Tests stay green:** `npm test`, `npm run typecheck`, lint and `npm run build` pass before every push.

---

## 6. Process (commit and push after each step; record in TESTS.md and BUILDLOG.md)

1. **Before screenshots:** Playwright captures every page at 1440×900 and 390×844, light and dark, into `docs/screens/before/`. Use seeded demo data with the dev login on a local server.
2. **Design system:** tokens, the formatting helpers and the core components, each with a small test where it has logic (formatting, ConfirmDialog focus).
3. **Public site:** `/`, `/trust`, `/privacy`, `/terms`, the spike tool (with tests against `evaluate()`), meta and OG.
4. **App shell + dashboard.**
5. **Orders, Packs and pack view, Evidence, Launch plan, Ask Standing.** One screen per commit.
6. **QA:**
   - after-screenshots into `docs/screens/after/`;
   - axe on every page;
   - Lighthouse on `/`;
   - keyboard-only walkthrough of connect → fix → pack;
   - check every page at 390 px.
   Record the results in TESTS.md.
7. **Deploy** to the VPS. Click through the hosted app with the verified test login. Update the README screenshots (no dev badge) and the Devpost draft if any wording changed.

**Stop and report** if any step would need a logic change, if tests fail and the fix isn't obvious, or if it's past Monday 18:00 Lagos.

---

## Sources (research, 7 Nov 2026)
- DesignRevision, *15 Best Fintech SaaS Landing Pages (2026)*: hero structure, trust placement, CTA strategy, Mercury/Ramp/Wise/Stripe takeaways. https://designrevision.com/blog/fintech-saas-landing-pages
- Utsubo, *Trust Design Patterns for Fintech Websites* (May 2026): 12 trust signals, honesty rules, trust pages, footers. https://www.utsubo.com/blog/fintech-website-trust-design-patterns
- Webtrends, *Stripe website design analysis*: typography, motion restraint, microcopy. https://webtrends.pages.dev/posts/stripe-website-design-analysis
- Celvix, *SaaS Dashboard UX* (May 2026): job-to-be-done hierarchy, progressive disclosure, empty states. https://celvix-websites.pages.dev/blog/saas-dashboard-ux-design/
- Goodface, *Custom SaaS dashboard design in 2026*: 5-second test, per-component error states, empty states. https://goodface.agency/insight/custom-saas-dashboard-design-guide/
- Anthony Hobday, critiques of the Stripe and Linear websites. https://anthonyhobday.com/blog/20220810 · https://anthonyhobday.com/blog/20230119.html

---

## 7. Additions (8 Nov 2026)

Same guardrails: no logic changes, no fabricated claims or third-party logos, honesty labels stay.

### A. Livelier colours
Light tokens: accent `#0f6b4f` (hover `#0b5a42`), accent-bg `#e2f5ec`, bg `#fbfaf6`, surface `#ffffff`; highlight
`#f2b33d` with highlight-bg `#fff4dc` (small touches only: key-number underlines, one hero glow, the active tab marker;
never body text); info `#2563a8`/`#e8f0fb`; ok `#0f7350`/`#e3f5ec`; warn `#a15c00`/`#fff4dc`; bad `#b3261e`/`#fdecea`.
Dark: accent `#5fd3a5`, highlight `#f5c46b`; the rest of dark unchanged. Contrast stays WCAG AA (tokens.test.ts).

### B. Landing page at a top fintech-brand standard
Sections in order:
1. sticky translucent header (blur on scroll): logo, How it works, Trust, GitHub, "Try the demo";
2. hero: ~60px serif headline, the subhead, one button and a text link, the status line; a real dashboard screenshot
   in a tilted window frame with a mint and marigold glow, plus two small floating cards cropped from real UI;
3. a "Built on" strip of plain-text chips for the PayPal APIs used (no logos);
4. proof numbers (large mono, labelled and linked, from one constants file);
5. the problem in PayPal's own words: 3 quote cards with sources;
6. How it works as a bento grid (Watch / Fix / Prove) with real UI crops;
7. the spike tool in a highlighted card;
8. a full-width dark pine band, "The AI never writes a number.", with the code-vs-AI comparison;
9. safe fixes as the 4-step timeline;
10. honest results with the held-out table, including the miss;
11. FAQ accordion;
12. final CTA band (mint-to-paper gradient), then the footer (Trust, Privacy, Terms, GitHub, MIT, not affiliated).
Motion: fade-up on scroll and hover lift on cards only, respecting prefers-reduced-motion. Responsive to 390px.
