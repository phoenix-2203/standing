# Build log

## 31 Oct 2026
- Day-1 tests 2–5 passed against the PayPal sandbox (details and debug IDs in TESTS.md).
- Blueprint updated with the test findings; tagline added.
- Started the Mon 2 Nov task early: Next.js 16 + TypeScript skeleton, Drizzle schema + first migration.
- TypeScript PayPal client (sandbox guard, token cache, required stable request IDs, first response stored).
- Webhook endpoint with PayPal signature verification and event-ID dedupe; 31 Vitest tests pass.
- Started the Tue 3 Nov task early: Transaction Search + disputes sync (backfill, overlap, cursor).
- Metrics engine for the six §4 metrics and alert engine; 94 tests pass, spike alert fires on seeded data.
- Live sandbox cycle passed; the day-1 orders aren't in Transaction Search yet (data refreshed 12:29Z).
- Metric decisions applied: New seller status, "not enough history" spike state, demo-shop order kinds.
- Tracking read-back from PayPal; live cycle synced 16 real transactions and found the day-1 tracker.

## 31 Oct 2026 (evening)
- Eval set to 53 products; Groq eval 94% recall, T10 injection caught; quote validator fixed (Groq 83% → 91% verdicts on re-score).
- Safe-fix queue (preview → cancel window → one-call send) with live sandbox tracking push and "marks the order Completed" (both 201).
- Evidence ledger (payments, tracking, Completed, invoices, traffic sources) and pack builder with a code-computed summary.
- Citation validator blocks forged citations, but tokens can be recombined into false claims: stopped before PDF/live pack.
- Gemini switched to gemini-3.8-flash (2.5 closed to new keys); its eval is still running.

## 6 Nov 2026
- Log in with PayPal flow: state check, server-side code exchange, verified / unverified / couldn't-read, checklist item 1, signed session on seller routes.
- Launch plan: products policy-checked, pack pre-built, planned spike becomes "expected spike: pack ready"; larger or unplanned spikes still warn.
- Digital module: Completed gaps, one-click fix through the queue, delivery proof as evidence; no funds-release wording.
- Ask Standing: answers only from code-rendered facts; refusals are fixed text. Eval: 15/15 refused, 0/10 false refusals.
- Refusal eval, run 1 → prompt fix `a72e975` → run 2: injections handled wrongly went from 3/5 to 1/5. Nothing leaked in either run. I05 is still refused; its score stands, because the rule was written before the runs.
- Fixed the production build (login routes), added a minimal /checklist page, and put a session check on the pack PDF. Full live login still needs a human.
