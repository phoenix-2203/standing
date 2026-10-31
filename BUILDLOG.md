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
