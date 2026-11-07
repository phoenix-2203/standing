# Platform opportunities: unused PayPal features and hackathon angles for Standing

Research date: 7 Nov 2026 (Lagos). All pages accessed 7 Nov 2026 unless noted.
Source labels: **[opened]** means the page or file was fetched and read. **[schema]** means the claim comes from PayPal's own OpenAPI file, downloaded from developer.paypal.com (`/api/<name>/schema.json`) and parsed locally. **[repo]** means the GitHub repo was read with `gh`. **[listing]** means the claim comes only from a search-results summary, without the page being opened.

---

## Ranked additions realistic in 2–3 days (summary for the report writer)

| # | Addition | Exact API / SDK | Sandbox? | Fits hard limits? | Criteria it lifts |
|---|---|---|---|---|---|
| 1 | **Close the dispute loop:** send the pack as evidence, then show the sandbox outcome | `POST /v1/customer/disputes/{id}/provide-evidence` (multipart); sandbox-only `POST .../require-evidence` and `POST .../adjudicate`; read `adjudications`, `dispute_outcome`, `seller_response_due_date` from `GET /v1/customer/disputes/{id}` | Yes. Two calls are documented "for sandbox use only" | Yes, if provide-evidence goes through preview, cancel window and send with a stable PayPal-Request-Id. `adjudicate` must be labelled "Sandbox test settlement (simulated PayPal decision)" so Standing never implies PayPal decided | Tech Implementation, Design (end-to-end loop), Best Use of PayPal + AI |
| 2 | **"Money held" panel** from balances, plus hold detection from T-codes and capture reasons | `GET /v1/reporting/balances` (`withheld_balance`, `available_balance`, `total_balance`, `as_of_time`, `last_refresh_time`); T-codes T1110, T15xx, T2101–T2123 in Transaction Search; Orders/Payments capture `status_details.reason` | API documented; sandbox balances endpoint same base URL. **Unconfirmed** whether sandbox ever shows a non-zero `withheld_balance` | Yes (read-only, plain code computes) | Tech, Impact (answers "is my money held?" honestly) |
| 3 | **Seller Protection eligibility per order** | Capture response `seller_protection.status` (ELIGIBLE / PARTIALLY_ELIGIBLE / NOT_ELIGIBLE) + `dispute_categories`; Transaction Search `protection_eligibility` (01/02/03) | Fields are in the schema; Standing already captures orders in sandbox | Yes (read-only) | Impact, Tech; cheap |
| 4 | **More webhook events** | `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.CAPTURE.REVERSED`, `CUSTOMER.DISPUTE.CREATED/UPDATED/RESOLVED` | Webhooks in sandbox already work for Standing; these specific events firing in sandbox is unconfirmed but likely for dispute and capture actions | Yes | Tech (real-time) |
| 5 | **Read-only PayPal Agent Toolkit / MCP "Ask Standing" console** | `@paypal/agent-toolkit` (npm 1.11.0, published 5 Nov 2026) with only read actions enabled (`disputes: {list, get}`, `orders: {get}`, `shipment: {show}`, transactions list); or remote MCP `https://mcp.sandbox.paypal.com/http` | Toolkit defaults to SANDBOX; a sandbox MCP endpoint is documented | Only if write tools are **not** registered. The toolkit's own example lets the LLM create orders, which would break "AI never decides a PayPal write" | Best Use of PayPal + AI, Agentic Commerce angle, Tech |
| 6 | **AG Grid upgrade (Community only)** | `ag-grid-community` 36.x: `PinnedRowModule` (totals row such as "held $X"), custom cell renderers (status chips, evidence-ID links), column groups ("PayPal says" / "Standing says"), CSV export of the evidence index, quick filter, column pinning; a second grid for disputes/evidence | N/A | Yes | AG Grid sponsor prize, Design |
| 7 | Sandbox dispute generator script for the demo | Create disputes as the sandbox buyer (the docs say merchants can create disputes in sandbox; exact creation route unconfirmed) then `require-evidence` | Yes (sandbox only) | Yes; label Simulated | Presentation |
| 8 | (Low) APIMatic Context Plugin used while coding, documented in README | APIMatic Context Plugin for PayPal Server SDKs (MCP, beta per PayPal blog 29 May 2026) | N/A (dev-time tool) | Yes | Only relevant to an APIMatic prize, but Standing can win only one sponsor prize and has chosen AG Grid |
| — | **Not recommended:** Payouts, Subscriptions, Fastlane, Payment Experience, Invoicing (as a feature) | — | — | Payouts moves money (conflicts with "plain code owns money" spirit and adds risk); Fastlane/Payment Experience are buyer-checkout features that don't serve the seller-protection story; Subscriptions has no fit. I did not open these docs; this is a fit judgement, not a capability claim | — |

---

## Which PayPal APIs fit (Disputes, Invoicing, Reporting/Balances, Payouts, Subscriptions, MCP/Agent Toolkit, Fastlane, Payment Experience), and which work in sandbox?

### Takeaway
The best fit is the Disputes **write** side. `provide-evidence` turns Standing's pack into something PayPal actually receives, and two sandbox-only calls (`require-evidence`, `adjudicate`) make a full dispute lifecycle demonstrable in the video. Next come Reporting/Balances (withheld funds) and a strictly read-only Agent Toolkit/MCP layer. Invoicing, Payouts, Subscriptions, Fastlane and Payment Experience are weak fits for a seller-protection product.

### Cited Findings
**Disputes v1** [schema](https://developer.paypal.com/api/customer-disputes/v1/schema.json), Disputes 1.12; [opened](https://developer.paypal.com/docs/api/customer-disputes/v1/)
- Endpoints: list, show, PATCH; actions `provide-evidence`, `appeal`, `accept-claim`, `adjudicate`, `require-evidence`, `escalate`, `send-message`, `make-offer`, `accept-offer`, `deny-offer`, `acknowledge-return-item`, `provide-supporting-info` — [opened](https://developer.paypal.com/docs/api/customer-disputes/v1/)
- `adjudicate` and `require-evidence` are each marked: "This method is for sandbox use only." — [opened](https://developer.paypal.com/docs/api/customer-disputes/v1/)
- `adjudicate` "Settles a dispute in either the customer's or merchant's favor… mimics the dispute resolution that PayPal agents normally complete". It requires status `UNDER_REVIEW` and the `adjudicate` HATEOAS link. Request body: `adjudication_outcome` — [schema](https://developer.paypal.com/api/customer-disputes/v1/schema.json)
- `require-evidence` moves `UNDER_REVIEW` to `WAITING_FOR_SELLER_RESPONSE` (action `SELLER_EVIDENCE`) or to `WAITING_FOR_BUYER_RESPONSE` (`BUYER_EVIDENCE`) — [schema](https://developer.paypal.com/api/customer-disputes/v1/schema.json)
- `provide-evidence`: a merchant can provide evidence when status is `WAITING_FOR_SELLER_RESPONSE`. Evidence can be proof of delivery (with tracking number), proof of refund (refund ID), or notes and documents. It must use the `provide-evidence` HATEOAS link; "In case the link is not present… you can't provide evidence" — [schema](https://developer.paypal.com/api/customer-disputes/v1/schema.json)
- Scopes [schema]: read uses `https://uri.paypal.com/services/disputes/read-seller` (or `read`). `provide-evidence`, `appeal`, `accept-claim`, `acknowledge-return-item` and PATCH use `.../disputes/update-seller`. `adjudicate` and `require-evidence` accept `update-seller` or `update-buyer` — [schema](https://developer.paypal.com/api/customer-disputes/v1/schema.json)
- App setup: "When you create an app, enable Disputes in the App feature options section." Also: "In the live environment, merchants cannot create disputes… However, merchants can create disputes in the sandbox environment." — [schema info block](https://developer.paypal.com/api/customer-disputes/v1/schema.json)
- `evidence_type` enum includes `PROOF_OF_FULFILLMENT`, `PROOF_OF_REFUND`, `PROOF_OF_DELIVERY_SIGNATURE`, `PROOF_OF_RECEIPT_COPY`, `RETURN_POLICY`, `ITEM_DESCRIPTION`, `PROOF_OF_RESHIPMENT`, `ADDITIONAL_PROOF_OF_SHIPMENT`, and others. This maps directly onto Standing's evidence kinds (txn / delivery / invoice / digital_delivery) — [schema](https://developer.paypal.com/api/customer-disputes/v1/schema.json)
- `adjudication_type` enum: `DENY_BUYER`, `PAYOUT_TO_BUYER`, `PAYOUT_TO_SELLER`, `RECOVER_FROM_SELLER`. Dispute object fields include `adjudications`, `dispute_outcome`, `money_movements`, `fund_movements`, `seller_response_due_date`, `allowed_response_options` (`acknowledge_return_item`, `accept_claim`, `make_offer`) — [schema](https://developer.paypal.com/api/customer-disputes/v1/schema.json)
- `provide-evidence` and `appeal` define no JSON-only request body in the schema (`requestBody` empty in the parsed file). The integration guide covers multipart document upload, but I did not open it, so **the exact multipart shape is unconfirmed** — [schema](https://developer.paypal.com/api/customer-disputes/v1/schema.json)

**Invoicing v2** [schema](https://developer.paypal.com/api/invoicing/v2/schema.json)
- Full CRUD plus send/remind/cancel/record-payment/refund/QR/templates/recurring. Read scope `https://uri.paypal.com/services/invoicing/invoices/read`, write scope `.../invoices/readwrite`. Some recurring and conditional-rule endpoints also list `.../invoicing/internal` — [schema](https://developer.paypal.com/api/invoicing/v2/schema.json)
- Invoicing webhook names on the event list sit with the deprecated v1 methods (`INVOICING.INVOICE.PAID` etc.) — [opened](https://developer.paypal.com/api/rest/webhooks/event-names/) (page shows "Last updated: September 10, 2026" per [listing])

**PayPal Agent Toolkit / MCP**
- Repo `paypal/agent-toolkit`: last push 1 Sep 2026, updated 30 Oct 2026, 198 stars, not archived. npm `@paypal/agent-toolkit` 1.11.0 and `@paypal/mcp` 1.8.1, both modified 5 Nov 2026 — [repo](https://github.com/paypal/agent-toolkit) (via `gh api` and `npm view`)
- Tools include invoices (about 20), payments (`create_order`, `get_order`, `pay_order`, `create_refund`, `get_refund`), disputes (`list_disputes`, `get_dispute`, `accept_dispute_claim`; **no provide-evidence tool**), shipment tracking (create/get/update), catalog, subscriptions, and reporting (`list_transactions`, `get_merchant_insights`) — [repo README](https://github.com/paypal/agent-toolkit)
- Per-action enablement: `configuration.actions` (for example `disputes: { list: true, get: true }`), and `context: { sandbox: true }`. `PAYPAL_ENVIRONMENT` "defaults to SANDBOX" — [repo README](https://github.com/paypal/agent-toolkit)
- `get_merchant_insights` calls `GET {base}/v1/merchant/insights?start_date&end_date&insight_type&time_interval` — [repo typescript/src/shared/functions.ts](https://github.com/paypal/agent-toolkit/blob/main/typescript/src/shared/functions.ts). I found no public REST reference for `/v1/merchant/insights` ([listing](https://policylayer.com/tools/paypal-agent-toolkit/get-merchant-insights) only), so **whether it works in sandbox is unconfirmed**.
- Remote MCP: sandbox `https://mcp.sandbox.paypal.com` with `/sse` or `/http`; production `https://mcp.paypal.com`. Auth is client credentials as a bearer token, or a PayPal login. The page lists no tools and no date — [opened](https://developer.paypal.com/ai-tools/mcp-server.md)
- APIMatic Context Plugin for PayPal Server SDKs: an MCP server that gives coding agents current PayPal SDK context, in beta per a PayPal blog dated 29 May 2026 — [listing](https://developer.paypal.com/community/blog/A%20New%20Context%20Plugin%20for%20AI-Assisted%20Coding%20with%20PayPal%20SDKs), [listing](https://apimatic.io/product/context-plugins)

**Hackathon framing** — [opened](https://developer.paypal.com/community/blog/PayPal_AI_Hackathon) (published 30 Sep 2026)
- "There are no prescribed problem statements and no set of tracks"; "your project must meaningfully use both PayPal and AI". Partners: APIMatic (PayPal context plugin), Render, Kernel, Channel3, Postman, Astropods, Elastic, AG Grid (dashboards), Bryntum (UI components). Submissions close 12 Nov 2026; winners announced 21 Dec 2026.

### Inferences
- Disputes `provide-evidence` is the single highest-value addition. Today Standing builds a pack but stops before PayPal; this would make the "builds the seller's case before PayPal asks" claim end in a real sandbox write with a PayPal debug ID. It is a PayPal write, so it must reuse the existing preview, cancel window, send and stable PayPal-Request-Id pipeline.
- The demo can run this sequence: create a dispute as the sandbox buyer, call `require-evidence` (SELLER_EVIDENCE), let Standing preview and send its evidence, call `adjudicate`, then read `adjudications`. The `adjudicate` step is a sandbox stand-in for a PayPal agent's decision. To respect "never claims what PayPal will decide", label it on screen as a simulated sandbox settlement and never present it as a prediction.
- Do not wire `accept_dispute_claim` or any toolkit write tool to the LLM. A read-only toolkit agent ("Which open disputes are due this week?") gives the "PayPal + AI / agentic" story while keeping AI out of writes. Registering only read actions is a configuration choice the README documents.
- Invoicing is a weak fit. PayPal invoices are seller-to-buyer bills, while Standing's "invoices" are supplier invoices used as evidence. The one possible use is to *read* existing PayPal invoices as extra evidence for invoiced orders.

### Gaps
- I did not open the Payouts, Subscriptions, Fastlane or Payment Experience docs. Their exclusion is a product-fit judgement, not a confirmed sandbox limitation.
- The exact multipart request shape and document limits for `provide-evidence` were not read from the integration guide.
- Whether a dispute created in sandbox reaches `UNDER_REVIEW` without manual steps (needed before `require-evidence`) is unconfirmed. Test it on day 1.
- Whether the existing Standing sandbox app has "Disputes" enabled with `update-seller` scope is unconfirmed. Check it in the Developer Dashboard.

---

## Is there a PayPal API for account status, limitations or holds? What can a seller app read?

### Takeaway
No public first-party seller API returns "your account is limited". The limitation webhooks and managed-account status are for **partner-managed accounts** (limited release). A seller-authorised app can read holds indirectly in four ways: `withheld_balance` from the Balances API, hold and release T-codes in Transaction Search, capture `status_details.reason` (for example `PENDING_REVIEW`), and `transaction_status` `P`/`D`/`V`.

### Cited Findings
- `GET /v1/reporting/balances` returns per currency `currency`, `primary`, `total_balance`, `available_balance`, `withheld_balance`. `withheld_balance` = "The portion of funds that PayPal holds for the customer that is not currently at the customer's disposal." The response has `as_of_time` and `last_refresh_time`. Scope `https://uri.paypal.com/services/reporting/balances/read`. "It takes a maximum of three hours for balances to appear"; covers up to three years back — [schema](https://developer.paypal.com/api/transaction-search/v1/schema.json) (Transaction Search 1.10)
- Also in the same API: `GET /v1/reporting/get-balance-net-summary` (scope `.../reporting/dataapiserv/balance-net-activity/read`) and `GET /v1/reporting/get-daily-summary` (scope `.../reporting/dataapiserv/daily/read`) — [schema](https://developer.paypal.com/api/transaction-search/v1/schema.json)
- `GET /v1/reporting/transactions` uses scope `.../reporting/search/read`. "It takes a maximum of three hours for executed transactions to appear" — [schema](https://developer.paypal.com/api/transaction-search/v1/schema.json)
- `transaction_info` fields include `transaction_event_code`, `transaction_status` (D denied by PayPal or merchant rules; P pending; S success; V fully reversed), `available_balance`, `protection_eligibility` (01 eligible / 02 not / 03 partial), `instrument_type`, `decline_code`. There is **no explicit hold flag field** — [schema](https://developer.paypal.com/api/transaction-search/v1/schema.json)
- Hold-related T-codes [opened](https://developer.paypal.com/docs/transaction-search/transaction-event-codes/):
  - T1110 "Hold on balance for dispute investigation" and T1111 for its cancellation
  - T1500 "General account hold", T1503 "Hold on available balance", T1105 reversal of general account hold
  - T2101/T2102 general hold and release
  - T2103/T2104 reserve hold and release
  - T2105/T2106 payment review hold and release (fraud and seller-protection review, up to 24 hours)
  - T2107/T2108 payment hold and release
  - T2111/T2112 external hold and release
  - T2114/T2115 tax hold and release
  - T2120–T2123 KYC holds (NLM accounts)
  - Chargebacks T1201/T1202; dispute fee T0114; chargeback fee T0106; T1106 "Payment reversal"
- Capture object (Payments v2): `status` ∈ COMPLETED, DECLINED, PARTIALLY_REFUNDED, PENDING, REFUNDED, FAILED. `status_details.reason` ∈ BUYER_COMPLAINT, CHARGEBACK, ECHECK, INTERNATIONAL_WITHDRAWAL, OTHER, PENDING_REVIEW, RECEIVING_PREFERENCE_MANDATES_MANUAL_ACTION, REFUNDED, TRANSACTION_APPROVED_AWAITING_FUNDING, UNILATERAL, VERIFICATION_REQUIRED, DECLINED_BY_RISK_FRAUD_FILTERS ("why the captured payment status is PENDING or DENIED"). `seller_protection.status` ∈ ELIGIBLE, PARTIALLY_ELIGIBLE, NOT_ELIGIBLE, plus `dispute_categories`. `disbursement_mode` ∈ INSTANT, DELAYED ("The funds that are held on behalf of the merchant"). `seller_receivable_breakdown` is "not available for transactions that are in pending state" — [schema](https://developer.paypal.com/api/payments/v2/schema.json)
- Limitation webhooks exist: `CUSTOMER.ACCOUNT-LIMITATION.ADDED/UPDATED/ESCALATED/LIFTED` ("A limitation was added to a merchant or managed account") and `CUSTOMER.MERCHANT-INTEGRATION.CAPABILITY-UPDATED` (requires the merchant to be enabled as PPCP) — [opened](https://developer.paypal.com/api/rest/webhooks/event-names/). Search listings place these under the partner "managed accounts" flow on limited-release commerce-platform pages — [listing](https://developer.paypal.com/limited-release/commerce-platform/webhooks)
- The merchant-integration status call with `payments_receivable` and `primary_email_confirmed` is documented under a **deprecated** Partner Referrals v1 path — [listing](https://developer.paypal.com/api/deprecated/partner-referrals/v1/merchant-integration-status). Current Partner Referrals v2 shows only `POST /v2/customer/partner-referrals` and `GET /v2/customer/partner-referrals/{id}` — [opened](https://developer.paypal.com/docs/api/partner-referrals/v2/)

### Inferences
- An honest "holds" feature: plain code (1) shows `withheld_balance` versus `available_balance` with `last_refresh_time`; (2) maps T-codes into a "held / released" ledger, pairing T2105 with T2106, T1110 with T1111, and so on; (3) flags captures with `PENDING` + `PENDING_REVIEW` / `VERIFICATION_REQUIRED`. The AI can then explain each item, citing the T-code row as evidence.
- Standing must not say it reads "account limitation status". That data is reachable only through partner/managed-account flows (limited release). This supports the blueprint's existing risk note: "Sandbox never limits accounts → say so".
- `protection_eligibility` and `seller_protection.status` are cheap, concrete fields that help the "Potential Impact" case ("this order isn't covered by Seller Protection; here's why tracking matters").

### Gaps
- Unconfirmed whether a sandbox business account ever shows non-zero `withheld_balance` or emits T21xx hold codes naturally. Demo data may need a "Simulated" label.
- Whether the Balances scope is granted by default to the existing sandbox app (alongside Transaction Search) is unconfirmed. Test with one call.
- Whether `CUSTOMER.ACCOUNT-LIMITATION.*` webhooks can be subscribed to by a non-partner app is unconfirmed.

---

## What would "Best Use of AG Grid" reward, and which Community features make the table non-trivial? Same for Bryntum and APIMatic.

### Takeaway
I could not read the prize criteria (Devpost blocked). Amounts from aggregators: AG Grid $5,000 / $2,000 / 3×$1,000. Standing's grid currently uses only sort, filter, resize and quick filter on one table. Real Community features can make it clearly non-trivial: pinned rows, cell renderers, column groups, CSV export and a second grid. Master/detail, row grouping, aggregation, set filter, sparklines, status bar and integrated charts are Enterprise-only.

### Cited Findings
- Community is free under MIT, including production use. Enterprise needs a commercial EULA licence. Without a key it works locally with a watermark and console error. A free 30-day trial licence removes them — [opened](https://www.ag-grid.com/javascript-data-grid/licensing/)
- Enterprise-only per the pricing comparison: Tree Data, Set Filter, Sparklines, Status Bar, Master Detail, Row Grouping, Row Spanning. Integrated Charts is Enterprise **Bundle** only. Community has CSV Export, column Groups, Quick Filter, column pinning and column spanning — [opened](https://www.ag-grid.com/license-pricing/)
- Also Enterprise per the licensing page: Pivot/Aggregation, Range Selection, Excel Export, Server-side row model, Tool panels, Context menu. Community includes cell renderers, theming and accessibility — [opened](https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise/)
- Row pinning from code (`pinnedTopRowData`/`pinnedBottomRowData`, `enableRowPinning`) uses `PinnedRowModule` imported from `ag-grid-community`. Pinning via the context menu needs Enterprise — [opened](https://www.ag-grid.com/react-data-grid/row-pinning/) (edition inferred from imports; the page has no badge)
- Current Standing usage: `ag-grid-community` / `ag-grid-react` ^36.3.0, one grid in `src/app/(seller)/orders/page.tsx` with `defaultColDef { sortable, filter, resizable }` and `quickFilterText` — local repo. The blueprint already selects the AG Grid prize (`docs/BLUEPRINT.md`, submission checklist).
- AG Grid prize amounts: 1st $5,000, 2nd $2,000, 3rd $1,000 × 3. APIMatic $1,000 × 3 plus 6 months Business subscription. Bryntum $1,000 × 3. Channel3 $1,500 × 1. Render credits $1,000 / $750 / $500. One main or Honourable Mention prize plus one sponsor prize — [listing via aggregators](https://www.startupgrantsindia.com/paypal-ai-hackathon-2026) [opened, but it is an aggregator], [listing](https://coursejoiner.com/hackathon/paypal-ai-hackathon-2026/)
- The PayPal blog describes AG Grid as offering "dashboards" and Bryntum "UI components" — [opened](https://developer.paypal.com/community/blog/PayPal_AI_Hackathon)
- Bryntum product and licence page returned HTTP 403 — [attempted](https://bryntum.com/products/)
- APIMatic's PayPal Context Plugin is an MCP server for AI coding agents (beta, PayPal blog 29 May 2026) — [listing](https://developer.paypal.com/community/blog/A%20New%20Context%20Plugin%20for%20AI-Assisted%20Coding%20with%20PayPal%20SDKs)

### Inferences
- Concrete Community-only upgrades, roughly 1 day:
  - A pinned bottom row with plain-code totals ("Held: $X · Missing tracking: N · Due in 48h: N")
  - Cell renderers for status chips, T-code badges, "Seller Protection: Eligible/Partial/Not", and clickable evidence IDs that open the pack citation
  - Column groups "PayPal says" (status, T-code, protection) vs "Standing says" (risk signal, fix state)
  - Row styles for orders inside a hold window
  - CSV export of the evidence index attached to the pack
  - A second grid for Disputes (deadline column with countdown, evidence completeness)
  - Grid state persisted per seller (Community status not confirmed on the pricing page)
- Avoid Enterprise trial keys. The repo is public and MIT, and a trial key in a public repo or hosted demo past 30 days risks watermarks or licence breach. Judges reviewing 1–15 Dec would land after a trial started now expires.
- A Community "detail" view can be done with an expandable custom row or a side panel. Full-width rows exist but their edition was **not confirmed**, so check the full-width-rows page before relying on it.
- Bryntum and APIMatic: Standing can take only one sponsor prize, and AG Grid has the largest pool. Using APIMatic's plugin during development costs little and can be mentioned honestly. Bryntum (a scheduler or Gantt for dispute deadlines) is not worth a commercial-licence detour.

### Gaps
- The official "Best Use of AG Grid / APIMatic / Bryntum / Channel3" requirements text is unread. Devpost returned 403, and the aggregators say "Sponsor prizes have their own requirements, so read each one". The user should read them manually in a browser.
- Bryntum licensing and trial terms were unverified (403).
- Channel3 was not researched beyond the prize amount.

---

## What did recent Devpost fintech/AI winners have in common? Is the PayPal AI Hackathon gallery visible?

### Takeaway
Devpost refused automated access (HTTP 403) on both `https://paypalaihackathon.devpost.com/project-gallery` and the hackathon home page, so I could not see what other entries are building. The only winner data I found is PayPal's own Dev Days hackathon from 2025, which is thin.

### Cited Findings
- `https://paypalaihackathon.devpost.com/project-gallery` returned HTTP 403 Forbidden to WebFetch (7 Nov 2026). The hackathon home page also returned 403. I did not try to get around the block.
- PayPal Dev Days hackathon winners (post dated 29 May 2025): 1st CrawlerPal, "a paywall AI agent assistant built with PayPal APIs"; 2nd Codebusters, Shopware 6 upgrade to beta PayPal JS SDK v6; 3rd Rosen, PYUSD social trading app. All were two-person teams and presented live as finalists — [opened](https://developer.paypal.com/community/blog/winners-dev-days-hackathon)
- Judges review 1–15 Dec 2026; "PayPal integration must be central, not minor" — [opened aggregator](https://www.startupgrantsindia.com/paypal-ai-hackathon-2026)

### Inferences
- The one comparable PayPal winner set rewarded agentic use of PayPal APIs (CrawlerPal) and use of newly released PayPal tooling (JS SDK v6 beta). This weakly supports adding a visible, bounded agent layer (read-only Agent Toolkit/MCP) and using the newest dispute and reporting surfaces. It is a single data point, not a pattern.
- "PayPal integration must be central" favours deepening the PayPal surface Standing touches: dispute evidence writes, balances and T-code holds, seller protection. It does not favour adding more AI.

### Gaps
- There is no data on current PayPal AI Hackathon entries. The user should open the gallery in their own browser before the 11 Nov submission.
- I found no sourced study of common traits of recent Devpost fintech/AI winners. The general-patterns search hit the usage limit and was not retried successfully, so this question is unanswered.
