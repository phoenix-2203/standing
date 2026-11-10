# Standing — Build Blueprint & 12-Day Plan

*Standing: stay in good standing with PayPal*

As of 31 Oct 2026. Deadline: 12 Nov 2026, 9:00 p.m. Lagos (12:00 p.m. Pacific). Target: submitted 11 Nov.

**One line:** Standing keeps a small seller's PayPal money moving — it catches what gets accounts held
before PayPal does, and builds the seller's case before PayPal asks.

**Mechanism line (for the pitch):** "Your case is built before you need it."

---

## 1. Problem and evidence

New and fast-growing sellers have PayPal funds held or accounts limited, often right when business takes off.
Most triggers are published by PayPal; sellers learn them only after their money is stuck.

- PayPal's own triggers: first-time seller; selling pattern unusual or changed — spike in sales, change in
  average selling price, platform or type of item. (paypal.com/webapps/mpp/security/funds-availability)
- Holds usually up to 21 days; dispute-related holds up to 180 days. (PayPal User Agreement)
- Many categories need PayPal pre-approval (charities, alcohol, tobacco/e-cigs, telemedicine, live streaming,
  gambling, dating, digital currencies, marketplaces…). Selling them without approval is itself a violation.
  (PayPal Acceptable Use Policy)
- 2026 cases: a candle maker limited after a viral weekend (~$11.2k); she recovered by submitting ID,
  supplier invoices, the video link aligned with her sales curve, and tracking for 90 orders.
  Another seller: $2k → $15k/month spike, 180-day hold, zero disputes. (terms.law forum threads)
- Digital/service sellers can't add tracking; PayPal releases their holds 7 days after order status is set
  to Completed. (PayPal help129)
- Willingness to pay (adjacent): a tracking-sync app alone is on ~13,300 Shopify stores.
- Who for: any small seller on PayPal, especially new accounts (every one starts as a "first-time seller").

Competitors: tracking-sync apps (Synctrack, TrackiPal, Paltrack) = tracking only; Chargeflow etc. = disputes;
LegitScript = AI policy scans sold to payment companies, not sellers; no public hackathon entry found.
Originality class: C.

## 2. Product

**Must build (core loop):**
1. **Connect & verified-seller check** — Log in with PayPal returns account-verification status; unverified
   → checklist item 1. If PayPal won't return the profile, show "Couldn't read your verification status"
   (never assume unverified). Data access in MVP = seller's own sandbox API keys.
2. **Product-policy check** — AI classifies each product: allowed / needs pre-approval / prohibited / unclear,
   quoting the exact policy clause; drafts the pre-approval request.
3. **Spike watcher** — deterministic metrics on PayPal's named triggers; same-day plain-language alert.
4. **Safe fixes** — tracking push to PayPal: preview → cancel window → send with stable request ID → show
   and log PayPal's response.
5. **Self-building explanation pack** — each order adds evidence (PayPal txn, delivery proof, invoice
   matches, traffic source). One click → PDF with sales curve + cover letter citing evidence IDs.
6. **Refusal** — AI declines evasion requests and explains why.

**Should build:** launch plan (expected spike → checked products, adjusted thresholds, pre-built pack);
digital & service sellers (Completed-status reminders + digital delivery proof + a safe fix that sends
`POST /v1/shipping/trackers` with status `COMPLETED` and no tracking number through the safe-fix queue,
worded "marks the order Completed"; never claim it releases funds); AG Grid review table
(one screen; sponsor prize).

**Roadmap only (one slide):** Standing for platforms (payout-change protection: the current PayPal account must
approve any change of payout destination); PayPal partner access for one-click connect; Shopify/WooCommerce.

**Must not build:** AI shopping agents, cross-platform blocklist, live-money mode, anything that hides activity
from PayPal.

## 3. How it works

Flow:
1. Seller connects (Log in with PayPal + sandbox keys) → verified-status check.
2. Cron (every 15 min) syncs Transaction Search, open disputes, captured orders; webhooks push captures/disputes.
3. Metrics engine recomputes triggers; alert engine fires on thresholds.
4. Evidence ledger grows with each order.
5. Seller approves fixes → action queue (preview → cancel window → send with stable request ID) → PayPal.
6. Pack builder: AI writer → citation validator → PDF.

PayPal surface:

| API | Use | Notes |
|---|---|---|
| Log in with PayPal (openid, email, `https://uri.paypal.com/services/paypalattributes`) | Verified-seller check | Sandbox needs no review. Read `GET /v1/identity/openidconnect/userinfo?schema=openid`. `verified_account` is a **string** (`"true"`); compare explicitly, never by truthiness. On any userinfo error → "couldn't read status" state (✅ 31 Oct) |
| Transaction Search `/v1/reporting/transactions` | History, baseline, spikes, sales curve | Enabled ✅ (scope `reporting/search/read` confirmed 31 Oct). Data lags ≤3 h; ≤31 days per request |
| Disputes `/v1/customer/disputes` | Dispute rate, open cases | Read-only in MVP |
| Orders v2 | Demo shop sales; server-side card test orders for the spike | US sandbox business; card processing enabled (✅ 31 Oct). The **capture** status is the source of truth, not the order status |
| Shipment Tracking | Safe tracking push (physical: Orders v2 `/track`); digital "marks the order Completed" (`POST /v1/shipping/trackers`, `{"trackers":[{transaction_id, status: "COMPLETED"}]}`) | Scope `shipping/trackers/readwrite` confirmed; both calls ✅ 31 Oct. `trackers-batch` is deprecated |

Write rules from day-1 tests: store PayPal's **first** response for each action and treat it as the record.
A replay with the same request ID is not guaranteed to return it (one order-create replay returned
`422 TRANSACTION_REFUSED` instead). For payment state, read the capture
(`purchase_units[].payments.captures[].status`), not the order's top-level status.
| Webhooks + verify-webhook-signature | Real-time events | Dedupe by event ID |

AI does: classify products vs clauses (quote + confidence); explain alerts from computed numbers; read supplier
invoices (seller confirms); write cover letter citing evidence IDs; draft pre-approval requests.
AI never: computes metrics; decides PayPal writes; predicts PayPal decisions; invents facts; advises evasion.

## 4. Data model and numbers

Tables: sellers · paypal_connections · products · policy_findings · transactions · disputes · shipments ·
metrics_daily · alerts · actions (type, payload, request_id, status preview/scheduled/sent/cancelled/failed,
undo_until, paypal_response = first response, never overwritten by a replay) · evidence_items (kind txn/delivery/invoice/traffic_source/digital_delivery) ·
packs · launch_plans · audit_events.

Deterministic metrics (defaults are Standing's own, not PayPal rules — UI must say so):
- Spike ratio = last-24h gross ÷ mean daily gross of previous 28 days → alert ≥ 3× (launch plan turns it into
  "expected spike — pack ready").
- Average ticket change = 7-day avg order ÷ 28-day avg → alert ≥ 2×, or any single order ≥ 5× 28-day avg.
- New product type = category sold in last 7 days, not in prior 60.
- Tracking coverage = physical orders > 48 h old with tracking ÷ all such orders → alert < 90%.
- Digital completion gap = digital orders > 24 h old not marked Completed.
- Dispute rate (90 d) = disputes ÷ transactions (no alert; show note: PayPal's guide advises keeping complaints below 1% of sales).

Decisions (31 Oct):
- Order = PayPal payment received (`T00xx`), completed or pending, positive, USD. Refunds, reversals and
  denials are excluded. Multi-currency comes later.
- Windows are rolling 24 h blocks back from now. The single-order check covers the last 7 days.
- Tracking coverage and the digital gap look at the last 90 days.
- Physical/digital and category come from the seller's catalogue (`products`). For demo-shop orders,
  Orders v2 item categories are stored at creation as the fallback. Unmatched orders are counted as
  "unclassified".
- Digital gap alerts at ≥1 order older than 24 h. Dispute rate is shown with the note, never alerts.
- Under 7 days of sales history:
  - Show a calm **New seller** status ("first-time seller" is the first reason PayPal lists for holds),
    with a link to the checklist.
  - Spike ratio shows "not enough history yet".
  - New product type is suppressed.
  - With 7–28 days of history, the spike baseline averages over the days that exist.
- Tracking is read back from PayPal (`GET /v1/shipping/trackers`) every cycle for sales still missing it.

## 5. Day-by-day plan

| Date | Build | Done when |
|---|---|---|
| Sat 31 Oct | Sandbox setup ✅, Transaction Search ✅, repo + MIT licence, policy clause file, message 10 sellers | Messages sent |
| Sun 1 Nov | Day-1 tests 1–5 (✅ all done 31 Oct) | Results in TESTS.md; go/switch decision |
| Mon 2 Nov | App skeleton, DB, PayPal client (token cache, stable request IDs, sandbox guard), webhook endpoint + verification | Sandbox webhook stored once; duplicate ignored |
| Tue 3 Nov | Sync jobs + metrics engine + alert engine | Spike alert fires on seeded data (unit test) |
| Wed 4 Nov | Policy check: clause file, AI classifier (schema), 50-product labelled set | Accuracy table |
| Thu 5 Nov | Safe-fix queue: tracking push with preview/cancel/request ID/logged response | One real sandbox tracking push in-app |
| Fri 6 Nov | Evidence ledger + pack builder + citation validator + PDF | **Checkpoint: core loop end-to-end** |
| Sat 7 Nov | Launch plan, digital-seller module, refusal rules + 15-prompt test set | 15/15 refusals |
| Sun 8 Nov | UI: onboarding, checklist, AG Grid table, pack viewer; deploy to Render | Hosted app works for a fresh test login |
| Mon 9 Nov | Hardening: negative tests, prompt injection, webhook replay; recheck gallery; compile interview quotes | All green; quotes in README |
| Tue 10 Nov | Generate demo spike (3 h lag!), README, architecture image, test logins, rough video | Rough cut < 3:00 |
| Wed 11 Nov | Final video (YouTube public), Devpost write-up incl. AI tools; **submit** | Submission received |
| Thu 12 Nov | Buffer only | — |

## 6. Day-1 tests

| # | Test | Pass | If it fails | Result (details in TESTS.md) |
|---|---|---|---|---|
| 1 | Transaction Search returns sandbox sales | 200 OK with transactions (connection ✅ 31 Oct; waiting for data lag) | Retry after 3 h; if still failing Mon → switch to PayeeSeal | ✅ Done 31 Oct: 200 with the $500 payment `0WW5775245286422M`; day-1 orders appear after PayPal's next refresh |
| 2 | Script ~30 server-side sandbox card orders, captured | 30 capture IDs logged | Fewer buyer-approved orders, label spike simulated | ✅ Done 31 Oct: 30/30 captured + 1 digital order |
| 3 | Push one tracking number via Shipment Tracking API | Success; visible on the transaction | Reconsider build | ✅ Done 31 Oct: 201, tracker on the order; tracker `STANDINGD1PHY01` visible on transaction `1GB72668J97404239` in the sandbox web UI (confirmed by user) |
| 4 | Log in with PayPal returns account-verification status | Field present | Drop verified-seller check | ✅ Done 31 Oct: `verified_account` = `"true"` (unverified value not yet seen) |
| 5 | Any API to set a digital order Completed without tracking | Documented call works | Reminder-only version (expected) | ✅ Done 31 Oct: `POST /v1/shipping/trackers` status `COMPLETED` → 201; hold-release effect unproven, keep reminders |

Seller interviews (8–10 by 9 Nov): Has PayPal held your money or limited you? What did they ask for and how long
did it take? Did you know some products need pre-approval? What would early warning + ready documents be worth?
May I quote you? Record answers word for word; never invent quotes.

## 7. Test plan and evaluation

| Eval | Set | Target |
|---|---|---|
| Policy check | 50 labelled products (15 allowed, 15 pre-approval, 10 prohibited, 10 tricky) | Catch ≥90% of prohibited + pre-approval; report misses |
| Pack groundedness | 10 packs | 100% sentences cite valid evidence IDs |
| Refusal | 15 evasion + 10 normal prompts | 15/15 refused; ≤1 false refusal |
| Prompt injection | 5 poisoned descriptions/invoices | 0 behaviour changes |

Code tests: metrics edge cases; alerts; action queue (cancel in window, double click → one call, retry reuses
request ID); webhook (bad signature rejected, duplicate ignored); sandbox guard.

## 8. Demo script (≤ 2:50, no third-party logos or music)

1. 0:00 Hook — "Viral weekend. Account limited Monday. $11k stuck."
2. 0:20 Connect — Log in with PayPal → "Unverified" checklist item; policy flag with clause + pre-approval draft.
3. 0:55 Launch plan — "Expecting 6× Friday" → thresholds set, pack pre-building.
4. 1:20 Side-by-side replay — without: scramble timer; with: alert, tracking pushed (real PayPal IDs), digital
   orders flagged, pack in one click.
5. 2:10 Refusal — "How do I split payments so PayPal doesn't notice?" → declined with reason.
6. 2:25 Proof + next — eval numbers, seller quotes, roadmap slide.

Submission checklist: hosted app (awake through 15 Dec) · public repo with visible MIT licence · README (setup,
test logins, architecture, APIs, evals, limits) · YouTube video < 3:00 · Devpost write-up incl. AI tools ·
test credentials in private field · AG Grid prize selected (max one sponsor prize) · submit by 11 Nov.

## 9. Risks and when to switch

- "Seller dashboard" perception → lead with self-building pack + replay; one table screen.
- "Gaming PayPal" perception → refusal scene; "PayPal's published reasons" wording.
- Sandbox never limits accounts → say so; show signals, fixes, pack; label simulations.
- Transaction Search lag → generate demo spike the day before recording.
- Misclassification → seller confirms flags; publish accuracy.
- Post-hackathon data access needs PayPal partner approval → roadmap.
- Scope creep → Fri 6 Nov checkpoint; cut "should build" first.

Switch to PayeeSeal if test 1 still fails Mon 2 Nov, test 3 fails, or most interviewed sellers say holds aren't a
real problem. Score today ≈ 81/100 (internal rubric); ≈ 82 with interview evidence.
