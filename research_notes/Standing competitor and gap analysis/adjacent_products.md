# Adjacent products Standing can learn from

Research date: 7 Nov 2026. Source labels used below:
- **[opened]**: I fetched the page. Note that the fetch tool returns a summary made by a model, not the raw page.
- **[listing]**: the claim comes only from a search-result summary. I did not open the page, or the page did not load.
- Vendor statistics (win rates, ROI, "up to 90%") are the vendors' own claims. No one has checked them independently.
- Rule from the brief: copy patterns only, never wording or design.

Standing's plan (`docs/BLUEPRINT.md`, checked with grep on 7 Nov 2026) does not mention a projected status, a countdown to a dispute deadline, a timeline of events, or a win-rate view. That makes these candidate additions, not duplicates.

## 1. Dispute and chargeback automation (Chargeflow, Disputifier, Justt, Chargeblast, Stripe Smart Disputes, Shopify)

### Takeaway
Every tool in this group acts after a dispute is filed. They gather the merchant's own order, shipping and customer data into evidence matched to the dispute reason code, file it before the deadline, and charge a share of the money they win back. On PayPal, prevention means automatically refunding at the inquiry stage. None of them watches whether a seller's PayPal account is about to be held or limited.

### Cited Findings
**Chargeflow** ([pricing page, opened](https://www.chargeflow.io/pricing))
- Five products: Prevent 2.0 (screens transactions before fulfilment), Automation (handles recovery end to end), Alerts (card-network alerts through Verifi and Ethoca), Insights (dashboard) and Connect (embedded or white-label for platforms).
- Listed prices: Insights $0 ("Free Forever"). Prevent $0.10 per scanned transaction, first 1,000 free. Automation 25% of each recovered chargeback, nothing until money is recovered, dispute fee not included. Alerts $29 per deflected chargeback, with a lower price for more than 50 a month. Enterprise and Connect require a demo.
- AI claims: "LLM-powered" evidence, matched to the reason code and the card issuer and aligned with Visa Compelling Evidence 3.0. The page also says it can predict the chance of winning before filing.
- PayPal: Automation resolves PayPal inquiries end to end (also Klarna and Afterpay). Alerts work through Verifi and Ethoca, and the page does not mention PayPal for Alerts.
- How results are shown: win or loss emails, a weekly summary (win rate, money recovered, cases in progress), win-rate trends, cohorts, flags for repeat disputers, and comparisons across payment processors.
- Price history: a third-party tracker says Prevent fell to $0.10 per scanned transaction on 15 Oct 2026, and a July 2026 comparison listed $0.20 ([usagepricing, listing](https://www.usagepricing.com/blueprint/activity/chargeflow-2026-10-15-prevent-price-cut); [Redo, listing](https://redo.com/resources/articles/comparisons/chargeflow-pricing)). The same tracker says a startup programme cut the Automation fee to 7.5% in the first year ([usagepricing, listing](https://www.usagepricing.com/blueprint/chargeflow)).

**Disputifier**
- PayPal inquiry-stage automation ([help article dated 9 Jun 2026, opened](https://intercom.help/disputifier-bcd86c5ce710/en/articles/11043298-how-paypal-chargebacks-hurt-your-business-how-to-disputifier-s-paypal-alerts-help-you)):
  - Two modes: refund as soon as the inquiry is filed, or refund one to two days before it would escalate, leaving the seller time to contact the buyer.
  - Covers standalone PayPal accounts and PayPal Wallet through Shopify Payments. Does not cover direct chargebacks and does not predict them.
  - Activated by asking the team over chat, so it is not self-serve.
  - The article says PayPal treats a chargeback ratio above 1% as high risk, which can lead to reserves or limitation. This is the vendor's statement, not PayPal's.
- Pricing, per Redo's 20 Jul 2026 check of Disputifier's pricing page ([opened](https://redo.com/resources/articles/comparisons/disputifier-pricing); Redo sells a competing product):
  - Recovery: 20% of recovered revenue, capped at $250 per won chargeback.
  - Fraud prevention: $0.05 per order. Order-not-received prevention: $0.05 per order.
  - Alerts: custom pricing. No monthly fee.
  - The Shopify listing showed 4.4 stars from 73 reviews.
- Disputifier's Shopify listing shows alerts "from $17–$27.50/alert" ([Shopify App Store, listing](https://apps.shopify.com/disputifier)). This conflicts with the custom pricing above.

**Justt**
- Builds a separate, AI-generated evidence document for each dispute ("dynamic arguments") from 500+ data points instead of templates ([justt.ai, listing](https://justt.ai)).
- Its data science and domain teams define which arguments exist and the rules for using them ([Emerj, listing](https://emerj.com/tackling-chargeback-challenges-at-scale-with-machine-learning-and-dynamic-arguments-roenen-ben-ami-justt/)).
- Success-based pricing; exact terms come from sales ([rfp.wiki, listing](https://www.rfp.wiki/payments-fraud/fraud-detection/riskified/justt)).
- Aimed at enterprises. Raised a $30M Series C in Dec 2024, $100M in total ([Crowdfund Insider, listing](https://www.crowdfundinsider.com/2024/12/234390-chargeback-management-firm-justt-reports-30m-series-c-to-accelerate-business-expansion/)).

**Chargeblast**
- Products: Deflection, Recovery, Managed Refund Service, Receipts, PayPal Disputes, Embedded Alerts, BIN Lookup and MCC Lookup ([pricing page, opened; only the menu loaded](https://www.chargeblast.com/pricing)).
- The Recovery tier takes 15% of the amount recovered. It uses AI-generated evidence that an expert reviews before it is submitted ([listing](https://www.chargeblast.com/pricing)).
- G2 reviewers mention that it cannot deflect PayPal disputes ([G2, listing](https://www.g2.com/products/chargeblast)).
- A competitor says Chargeblast charges $19 per alert ([chargeback.io, listing](https://www.chargeback.io/blog/best-chargeblast-alternatives)).

**Stripe Smart Disputes** ([Stripe docs, opened](https://docs.stripe.com/disputes/smart-disputes))
- An "AI rules engine" pulls evidence from Stripe's internal data, the merchant's transaction data and cardholder data, matched to the dispute reason.
- Eligibility depends on the reason code, payment method, whether evidence exists and is relevant, and cost.
- The merchant is notified by email and in the Dashboard. If the merchant does nothing, Stripe submits the prepared evidence "just before the dispute times out". Auto-submit can be turned off, and the merchant can counter or accept the dispute manually instead.
- The merchant is responsible for the evidence being accurate. Stripe does not guarantee outcomes and charges only for won disputes.
- Stripe provides test cards that create eligible disputes.

**Shopify Payments** ([resolve chargeback help, opened](https://help.shopify.com/en/manual/payments/chargebacks/resolve-chargeback); [managing chargebacks, opened](https://help.shopify.com/en/manual/payments/shopify-payments/managing-chargebacks))
- Automatically fills in the evidence it has: product details, billing and shipping addresses, and shipping and tracking information. It sends this on the due date.
- Evidence is due 7 to 21 days after the chargeback is filed, and the due date is shown on the chargeback.
- Responses may include AI-generated insights, which the merchant can opt out of. Shopify's assistant, Sidekick, can guide the merchant.
- Winning a dispute does not remove it from the merchant's dispute rate.
- The disputed amount is deducted from the merchant's next payout.

**PayPal itself**
- I found no announcement in 2026 of an AI tool from PayPal that builds dispute evidence ([search, listing](https://history.paypal.com/us/brc/article/seller-protection-agentic-commerce)).
- PayPal's article on Seller Protection for AI-agent purchases says claims are judged on the transaction itself, whether a person or an AI shopping agent placed the order ([PayPal BRC, listing](https://history.paypal.com/us/brc/article/seller-protection-agentic-commerce)).

### Inferences: patterns for Standing
1. **Evidence matched to the dispute reason.** Every serious tool chooses evidence according to the dispute reason (item not received, not as described, unauthorised). Standing's evidence pack could include a short checklist for each PayPal dispute reason, with each item marked as present or missing, and keep its citation validator.
2. **A deadline that is always visible, plus a safe default.** Stripe submits automatically just before the deadline; Disputifier refunds one to two days before escalation. Standing should not take default actions that write to PayPal (CLAUDE.md rule 3), but it can show a countdown for each PayPal dispute (PayPal's 20-day escalation window) and add a preview item to the queue that the seller must approve. This fits Standing's preview, cancel and send flow.
3. **Inquiry-stage handling on PayPal.** Disputifier's strongest PayPal feature is acting before an inquiry becomes a claim. Standing could flag inquiries that are close to escalating and offer two choices in the preview queue: refund, or reply to the buyer with the tracking evidence.
4. **An estimate before filing (Chargeflow).** Standing must not predict PayPal's decisions (rule 3). Its honest version is a completeness signal, such as "4 of 5 recommended evidence types present", rather than a win probability.
5. **Showing results.** Weekly summary email, win-rate trends, repeat-disputer flags. Standing could send a weekly "what changed" summary and flag repeat buyers.
6. **The merchant stays responsible.** Stripe states that the merchant owns the accuracy of the evidence; Chargeblast has a human review AI evidence. This supports Standing's citation validator and keeping the seller as the final approver.
7. **Success-based pricing (20–25% of money recovered) is the norm.** For a pitch, Standing could position as prevention: it keeps money moving rather than taking a share of what is won back.

### Gaps
- I could not see Chargeblast's actual price list or the scope of its PayPal coverage; the page loaded only its menu.
- Justt's percentage is not public.
- I could not check what Chargeflow's AI output looks like inside the product.

## 2. How marketplaces and processors show a seller's standing (Amazon, eBay, Etsy, Stripe, Shopify)

### Takeaway
Two display styles dominate. Amazon reduces everything to one score in coloured bands. eBay and Etsy use a few named levels, each tied to explicit thresholds for each metric, a fixed evaluation date, a look-back window, and a projected level. eBay's "projected level if evaluated today" is the closest match to what Standing does. Stripe and PayPal only tell sellers about reserves after they are applied.

### Cited Findings
**Amazon Account Health Rating (AHR)** ([AHR policy](https://sellercentral.amazon.com/gp/help/external/G521) and [AHR FAQ](https://sellercentral.amazon.com/gp/help/external/GR786P4BPEVKTBAG), listing only; both pages loaded only the Seller Central landing page)
- One score from 0 to 1,000 in three bands: Healthy (green, 200 and above), At Risk (yellow, 100–199) and Unhealthy (red, 99 and below).
- The dashboard shows the score next to the policy violations to look into. New accounts start at 200.
- Sellers can contact an Account Health Specialist.
- Some third-party sources give different thresholds. I used Amazon's own help wording as it appeared in search results.

**eBay seller standards** ([eBay help, opened](https://www.ebay.com/help/selling/selling-seller-performance/seller-performance-standards?id=4347))
- Three levels: Top Rated, Above Standard and Below Standard. Buyers see only Top Rated.
- Evaluation runs on the 20th of each month. It covers the last 3 months if the seller had more than 400 transactions, otherwise the last 12 months.
- Metrics and thresholds:

  | Metric | Below Standard if above | Top Rated needs |
  |---|---|---|
  | Cases closed without seller resolution | the higher of 2 cases or 0.3% | same |
  | Transaction defect rate | 2%, counted only when more than 4 buyers are affected | ≤ 0.5%, ≤ 3 buyers |
  | Late shipments | no limit | ≤ 5 or 3% |
  | Valid tracking within handling time | no requirement | ≥ 95% |

- Top Rated also requires an account at least 90 days old, at least 100 transactions and at least $1,000 in US sales.
- **The dashboard shows the current level and the level the seller would get if evaluated today.** eBay tells sellers which metrics to fix first.
- Below Standard has staged consequences:
  - Immediately: lower search ranking, lower selling limits, no Promoted Listings, and funds held until tracking shows the item is on its way.
  - From the 1st of the next month: higher fees.
  - If it continues: store downgraded and selling restricted.
- eBay Live transactions are excluded from these metrics from 15 Oct 2026.
- On eBay Australia, from 1 Aug 2026 a higher fee applies to sellers who stay Below Standard for 4 or more consecutive months ([eBay AU, listing](https://www.ebay.com.au/help/policies/selling-policies/seller-standards-policy?id=4347)).

**Etsy Star Seller** ([Etsy help, opened](https://help.etsy.com/hc/articles/29665255990039))
- Each metric earns its own badge: message replies (95% of first messages answered within 24 hours), shipping (95% shipped on time with tracking) and reviews (4.8-star average).
- Minimum activity: 5 orders and $300 in sales in the review period.
- Eligibility is reviewed on the 1st of each month over a 3-month window. Stats refresh daily, with a monthly overview.
- Separate tabs show the current period (which counts toward the next evaluation) and the previous period (which explains the current badge).
- The orders and sales rows disappear once the minimum is met.
- A metric with no data (for example, no messages received) is skipped rather than counted as a failure.

**Stripe**
- Reserves ([support, opened](https://support.stripe.com/topics/reserves)):
  - Three types: fixed, rolling, and moving part of the existing balance into reserve.
  - Before applying one, Stripe sends the reserve terms, the percentage held and the holding period (usually 30–90 days). Status appears in the Dashboard under the balance's reserved funds.
  - The page describes no appeal process.
- Stripe Connect ([docs, opened](https://docs.stripe.com/connect/risk-management)): Managed Risk monitors risk signals and applies interventions automatically. Platforms can pause payouts or hold reserves on connected accounts, so the model is the processor acting on the seller.
- What sets reserve size, per WooCommerce's docs: industry, payment activity, dispute rate, refund rate and financial stability ([WooCommerce, listing](https://woocommerce.com/?p=18734001096013)).

**Shopify Payments**
- Disputed amounts come out of the next payout.
- Winning does not lower the dispute rate.
- Shopify also has a separate page on chargeback monitoring programmes ([help, opened](https://help.shopify.com/en/manual/payments/shopify-payments/managing-chargebacks)).

### Inferences: patterns for Standing
1. **Projected status if evaluated today (eBay).** Standing's checks for new sellers, sales spikes, order-size jumps, tracking gaps and disputes could roll up into a projected label such as "Likely fine / Watch / At risk of a hold". It must be labelled as Standing's own estimate, not PayPal's decision (rule 3). Each label should list the rules that triggered it, with the exact threshold for each.
2. **A table of thresholds per metric, not only one score.** eBay and Etsy show each metric against a stated limit. Standing's rules are deterministic code, so it can show the actual cut-offs (for example, today's sales against the 28-day average). Amazon's single 0–1,000 score is opaque, and PayPal publishes no score for Standing to mirror. A banded single score would also look like a PayPal metric.
3. **Current period and previous period.** Etsy shows the window that explains today's status beside the window that will decide the next one. For Standing: the last 28 days compared with the last 24 hours, or this week compared with last week.
4. **Hiding conditions already met and skipping metrics with no data.** This keeps the screen short for a small seller, and a new seller with no disputes is not marked down.
5. **Consequences staged and shown in plain words** (eBay). Standing could show what each PayPal hold reason typically leads to, citing PayPal's published help pages and not inventing any.
6. **"What to fix first"** (eBay names the metrics with the biggest effect). Standing's preview queue could be ordered by which fix removes the most risk.
7. **A timeline.** None of these products clearly shows a timeline of events. A dated log of events for each account (sale, spike, tracking added, dispute opened or closed) would also feed the evidence pack.

### Gaps
- I could not open Amazon's official AHR pages, so the bands come from search summaries only.
- I could not confirm how Amazon's dashboard visually shows trends.
- No official Stripe page explains how reserve release dates are shown or how to appeal.
- I found no public PayPal seller-health score or dashboard to compare with.

## 3. AI policy and merchant-risk classification (LegitScript, G2 Risk Solutions, Persona, Sardine)

### Takeaway
These tools are sold to acquirers, payment providers and platforms (business-to-business), not to sellers. They crawl merchant websites, classify the content against card-network rules and prohibited-product categories, check the merchant category code (MCC), and send results to a human analyst. Pricing is by quote. The only part a seller can buy is LegitScript certification, aimed at regulated sectors such as health, and it costs thousands of dollars a year.

### Cited Findings
**LegitScript**
- Xray, an "AI Risk Intelligence" platform launched in March 2025, covers transaction-laundering detection, merchant URL identification and AI-assisted onboarding ([BusinessWire, listing; the page returned 403](https://www.businesswire.com/news/home/20250304828992/en/LegitScript-Unveils-Next-Generation-AI-Powered-Platform-That-Transforms-Merchant-Risk-Management)).
- Its MCC tool crawls a merchant's site in real time, and AI models produce recommendations ([listing via G2RS search](https://www.legitscript.com/?p=36775)).
- Certification fees, from a reseller guide and unverified: $975 to apply and $2,150 a year per website ([Convesio, listing](https://convesio.com/knowledgebase/article/legitscript-certification-guide/)).
- Sites are scanned whether or not they hold certification.
- I found no product priced for small sellers. Discounts mentioned are for telemedicine and addiction-treatment providers.

**G2 Risk Solutions (G2RS)**
- MCC Verify: AI flags merchants coded under the wrong MCC, and an analyst reviews the result, citing indicators from the merchant's website ([G2RS, listing](https://g2risksolutions.com/mcc-verify/)).
- Persistent Merchant Monitoring scans websites for prohibited products and card-network violations ([listing](https://g2risksolutions.com/persistent-merchant-monitoring)).
- Its Content Compliance component scans for content restricted under Mastercard's BRAM programme. G2RS says Mastercard's revised merchant monitoring standards took effect on 1 Jan 2026 ([G2RS, listing](https://g2risksolutions.com/mastercards-new-merchant-monitoring-requirements/)).
- Acquired EverC, an AI risk-classification platform, in October 2025. A press release dated 12 Oct 2026 says it added more than 100 customers in 12 months ([SalesTechStar, listing](https://salestechstar.com/predictive-ai-artificial-intelligence/g2-risk-solutions-surpasses-100-new-customers-in-12-months-as-demand-for-ai-native-merchant-risk-intelligence-accelerates/)).

**Sardine**
- AI agents for business verification (KYB) handle missing data, open-source research, adverse-media review, document validation and alert prioritisation. Pricing is by quote ([sardine.ai/kyb, listing](https://sardine.ai/kyb); [AI Agent Index, updated 30 Oct 2026, listing](https://theaiagentindex.com/agents/sardine)).
- Named a Leader in the Forrester Wave for Financial Crime Management, Q3 2026 ([listing](https://www.sardine.ai/blog/kyb-checks)).

**Persona**
- Identity and business verification and merchant onboarding for platforms ([The Paypers, listing](https://thepaypers.com/payments/company-information/persona)).
- A third party says pricing starts at $250 a month ([xpay, checked 3 May 2026, listing](https://www.xpay.sh/saas-pricing/persona/)).
- A customer story says merchant onboarding fell from 92 days to 3 ([Persona, listing](https://withpersona.com/customers/anton-payments)).

### Inferences: patterns for Standing
1. **AI flags, a human decides, and the evidence is shown** (G2RS and LegitScript use analyst review and website indicators). This confirms Standing's design: AI quotes the policy clause, and the seller sees the product text that triggered the flag. Standing could also show the exact matched text next to the clause.
2. **Check the product against the category code.** G2RS's MCC check is a pattern Standing could adapt for small sellers: "your listings look like category X, and PayPal's Acceptable Use Policy treats X as restricted or needing pre-approval." It should quote the clause and never decide.
3. **Monitor continuously, not only at onboarding.** These vendors re-scan sites. Standing could re-check products when the catalogue changes, not only once.
4. **Seen from the seller's side, these tools are a threat:** acquirers and PayPal-like providers use them to find sellers. Standing is the reverse — it shows the seller what such a scan would probably flag. That message suits the pitch.

### Gaps
- I found no published accuracy figures for any of these classifiers.
- I found no product in this group sold directly to small sellers.
- I could not open Persona's official pricing page.

## 4. White space for small PayPal sellers, and which products overlap

### Takeaway
No product I found warns a small PayPal seller before PayPal holds or limits the account, using PayPal's published hold reasons. The closest products are dispute tools (Disputifier, Chargeflow) that handle PayPal inquiries after a buyer files, and tracking-sync apps that release holds after the fact. Standing's combination is open ground: early warnings tied to PayPal's hold reasons, plus safe fixes the seller previews, plus a product-policy check that quotes the clause, plus an evidence pack where every sentence is cited, built before PayPal asks.

### Cited Findings
- A search for a PayPal pre-limitation monitoring tool found only blogs, forum threads and tracking-sync apps such as PaySync, which upload tracking to release holds. I found no product that alerts before a limitation ([search, listing](https://www.salehoo.com/blog/coping-with-paypal-payment-holds); [PaySync, listing](https://paysync-website.pages.dev/blogs/how-to-get-paypal-money-off-hold-without-tracking-number)).
- PayPal's own help lists being a first-time seller as a hold reason ([PayPal funds availability, listing](https://www.paypal.com/us/brc/article/funds-availability)).
- Disputifier's PayPal feature does not predict disputes or chargebacks and starts only after an inquiry is filed ([opened](https://intercom.help/disputifier-bcd86c5ce710/en/articles/11043298-how-paypal-chargebacks-hurt-your-business-how-to-disputifier-s-paypal-alerts-help-you)).
- Chargeflow covers PayPal inquiries in Automation, but its alerts are card-network only ([opened](https://www.chargeflow.io/pricing)).
- Reviewers say Chargeblast cannot deflect PayPal disputes ([G2, listing](https://www.g2.com/products/chargeblast)).
- Merchant-risk AI tools (LegitScript, G2RS, Sardine, Persona) are sold to acquirers and platforms (see section 3).
- Marketplace health dashboards (Amazon, eBay, Etsy) exist only inside those marketplaces (see section 2).

### Overlap map

| Product | Overlap with Standing | Where Standing differs |
|---|---|---|
| Disputifier | PayPal inquiry-stage handling | It refunds after filing; Standing warns earlier and covers more than disputes |
| Chargeflow | Evidence generation, including PayPal inquiries; analytics | It works after a dispute; card alerts only; takes 25% |
| Chargeblast | AI evidence with human review; listed "PayPal Disputes" product | It works after a dispute; reviewers report weak PayPal deflection |
| Justt | Evidence per case, not templates | Enterprise-only |
| Stripe Smart Disputes and Shopify | Evidence filled in automatically | Locked to their own processors; not PayPal |
| PaySync, Synctrack and other tracking-sync apps | Tracking upload to release PayPal holds | Fix after the fact; no warnings, policy check or evidence pack |
| eBay, Etsy and Amazon dashboards | The "standing" display idea | Marketplace-only; nothing like it for PayPal |
| LegitScript, G2RS, Sardine, Persona | AI policy classification | Sold to acquirers and platforms, not sellers |

### Inferences
- Gaps in the market that Standing fills:
  1. A projected status before a hold, using PayPal's published reasons.
  2. Fixes the seller previews and can cancel, with stored IDs that prevent duplicate PayPal writes.
  3. A product-policy check written for the seller, quoting PayPal's clause.
  4. An evidence pack where every sentence must cite its source, built before PayPal asks rather than after a dispute.
  5. A product aimed at small sellers rather than enterprises or acquirers.
- Rule 7 in CLAUDE.md (refusing to help evade PayPal's checks) is itself a difference from the market. I found no adjacent product that states such a refusal.
- Ranked by how much each adds for the cost, for the remaining build days:
  1. eBay-style projected status, with the thresholds for each rule shown.
  2. Countdown for each PayPal dispute and inquiry, with a refund or reply option in the preview queue.
  3. Evidence checklist for each dispute reason, with a completeness count instead of a win probability.
  4. Etsy-style current-window and previous-window view, hiding conditions already met.
  5. Weekly "what changed" summary.
  6. Dated event timeline for each account, which also feeds the evidence pack.

### Gaps
- My search coverage was limited, so a small PayPal-specific monitoring app I missed could exist. Searching the Shopify App Store and WooCommerce marketplace for "PayPal hold" would confirm or rule this out.
- I found no PayPal data on how often each hold reason is triggered.
