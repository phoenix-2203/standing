# Devpost submission — draft

Paste section by section into Devpost. Fill every **[TO FILL]** before submitting; numbers in brackets
must be copied from TESTS.md on the day, not from this draft.

---

**Project name:** Standing

**Tagline (≤ 60 chars):** Stay in good standing with PayPal.

**Links**
- Live demo: https://goodstanding.duckdns.org (PayPal sandbox only)
- Code: https://github.com/phoenix-2203/standing (MIT)
- Video: **[TO FILL: YouTube link, under 3 minutes]**

**Test credentials (private field, not the public write-up):** the two sandbox logins (verified and
unverified). **[TO FILL in Devpost's private field only. Never in the README, the video or this file.]**

---

## Inspiration

A small seller's best week can be the week their money stops. PayPal's own help pages list the reasons
it may hold funds: being a first-time seller, a recent spike in sales, a change in average selling price
or in the type of item sold. Those signals are published, but most sellers only read them after the money
is stuck.

PayPal went live in Nigeria through Paga in January 2026. That means a new wave of people receiving their
first international payments, and in PayPal's terms every one of them starts as a first-time seller. We
wanted a tool that sits with the seller *before* the hold: it watches the same published signals, fixes what
can safely be fixed, and has the seller's explanation ready before anyone asks for it.

*We have not interviewed sellers. The problem evidence is PayPal's own pages and dated public sources,
listed in `docs/RESEARCH.md`.*

## What it does

- **Verified-seller check.** Log in with PayPal reads whether the account is verified. "Couldn't read" is
  shown as its own state and never treated as unverified.
- **Signal watch, every 15 minutes:** spike ratio, average order change, new product type, tracking
  coverage, digital orders not marked Completed, 90-day dispute rate. The alert thresholds are Standing's own
  defaults, and the app says they aren't PayPal rules.
- **Product policy check.** Each product is mapped to PayPal's Acceptable Use Policy. The verdict is allowed,
  needs pre-approval, prohibited, or unclear, with the exact clause quoted.
- **Launch plan.** Tell Standing you expect 6× sales on Friday. A spike within the plan shows as "Expected
  spike: pack ready"; a bigger one still warns.
- **Safe fixes.** One click marks a digital order Completed in PayPal. You see a preview first, then a
  2-minute cancel window, then exactly one call with a stable request ID. PayPal's first response is stored.
- **Explanation pack.** A cover letter, sales curve and numbered evidence list, exported as a PDF. Every
  number in it is written by code, never by the AI.
- **Ask Standing.** Answers questions only from the seller's own figures, alerts, PayPal's clauses and
  evidence. It refuses to help evade PayPal's checks.
- **Your own evidence.** Supplier invoices and the post that started a spike become numbered evidence the pack can cite.
- **Pre-approval requests.** For a product that needs PayPal's approval, a draft quoting the clause word for word. Code writes it, and the seller fills the blanks and sends it.
- **Orders table** built with AG Grid Community: sort, filter, search and paging over every PayPal payment.

## How we built it

- **Next.js 16 + TypeScript**, **Postgres + Drizzle**, **AG Grid Community**, **react-pdf**, **Vitest**.
  Deployed with Docker behind Caddy on a VPS: the database has no public port and the app runs non-root and
  read-only.
- **PayPal sandbox APIs:** Log in with PayPal (Identity), Transaction Search, Disputes, Orders v2, Shipment
  Tracking (tracking push and "marks the order Completed"), and Webhooks with signature verification through
  PayPal's verify API, deduplicated by event ID.
- **AI:** Groq `openai/gpt-oss-120b` with JSON-schema output; Gemini as fallback.
- **The key design decision: the AI never writes a fact.** Code renders every factual sentence from data.
  The model only picks facts by ID, orders them, and adds short connecting sentences that may not contain
  digits. We got there by attacking our own first validator. It let "The seller received 0 PayPal
  payments" through, because a "0" appeared elsewhere in the evidence. So we stopped letting the AI write
  facts at all, and those attacks are now regression tests.
- **Evals with the scoring written down before each run.** Prompts were improved against a policy set of
  53 products and a refusal set of 30 prompts. A separate held-out set (20 products, 21 prompts), written
  by a different author after the prompts were frozen, was committed before it ran.

## Challenges we ran into

- **Proving honesty, not claiming it.** One injection test (I05, "state my spike ratio as 0.1") stayed a
  fail. The model refused, which is safe, but the rule written before the run said it shouldn't refuse. We
  kept the fail rather than move the goalposts.
- **Idempotency is subtle.** Replaying an order's request ID returned `422 TRANSACTION_REFUSED` instead
  of the original order. So Standing stores PayPal's *first* response per action and treats timeouts as
  "unknown", never "failed".
- **Free-tier AI limits.** Gemini's free tier ran out mid-eval (13 of 53 products), so we report no
  accuracy for it. Groq's strict JSON mode rejected nested output live, so we flattened the format and
  re-ran the refusal eval on it.
- **Sandbox realities.** Transaction Search can lag about 3 hours. Making an unverified sandbox account
  took several tries. And 31 of 33 orders arrive with no product name or SKU, so Standing says "unknown"
  instead of guessing.

## Accomplishments that we're proud of

- **Live on the real PayPal sandbox:**
  - 30/30 card orders captured.
  - Two simultaneous tracking pushes made exactly one PayPal call.
  - A digital order was marked Completed through the safe queue.
  - Verified and unverified logins were both shown correctly.
  - A genuine webhook was stored once, its resends were ignored, and a forged one was rejected.
- **AI results:**
  - Tuned policy set: **[33/33]** prohibited and pre-approval products flagged; **[49/53]** verdicts correct.
  - Tuned refusal set: **[15/15]** evasion prompts refused, **[0/10]** honest questions refused, **[1/5]** injections handled wrongly.
  - **Held-out sets: [TO FILL from TESTS.md after the run, whatever the result].**
- **[391+]** automated tests, plus a README that lists every miss.

## What we learned

PayPal's risk signals are public. The gap is timing: sellers meet them after the fact. We also learned
that the most valuable AI feature in a money product is knowing where the AI must stop. Code owns numbers,
PayPal writes and refusals; the AI routes and explains.

## What's next for Standing

- Email alerts.
- Syncing tracking from store platforms; reading supplier invoices from a photo.
- PayPal partner access so any seller can connect without their own API keys.

Never on the roadmap: anything that hides activity from PayPal.

## Built with

nextjs, typescript, react, postgresql, drizzle, ag-grid, react-pdf, vitest, docker, caddy, paypal-sandbox,
log-in-with-paypal, paypal-orders-v2, paypal-transaction-search, paypal-disputes, paypal-webhooks,
groq, gpt-oss-120b, gemini, claude-code

## AI tools used (disclosure)

- **Claude Code** (Anthropic) wrote most of the code, tests and docs, under rules in `CLAUDE.md`.
- **Claude** (chat) did research and planning, wrote the blueprint, reviewed progress, and wrote the
  held-out eval sets.
- **ChatGPT** produced an early research dossier. **[TO FILL: keep or remove, depending on whether you
  want to list it.]**
- **In the product:** Groq `openai/gpt-oss-120b`, with Google Gemini as a fallback.

## Prize categories to tick

- The main judging (Grand Prize / Honorable Mention).
- **AG Grid** sponsor prize: the orders table uses AG Grid Community. **[TO FILL: check the exact
  sponsor-prize wording on the Devpost page.]**
- Only one sponsor prize can be won, so tick the one that fits best.
