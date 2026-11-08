# Demo video script: target 2:45 (hard limit: under 3:00)

Updated 8 Nov for the redesigned screens. Read at a calm pace; about 130 words a minute fits the timings.

**Rules for the recording**
- Only Standing's screens and PayPal's sandbox login page.
- No other brands on screen: hide the bookmarks bar, dock and other tabs. Use a clean browser profile. No music you don't own.
- Anything simulated must show its **Simulated** label when it appears.
- Never show `.env`, keys, tokens or test passwords. Type logins off camera, or cut that part.
- 1080p, browser zoom 110%, light mode. Record each scene as its own clip; it's easier to redo one.

---

### 1. 0:00–0:15: Hook (homepage, top)
**Screen:** https://goodstanding.duckdns.org, hero visible. Slow scroll down to the proof numbers.
**Say:** "Your sales finally take off, and PayPal holds your money. PayPal publishes the reasons: new sellers, sudden
spikes, a change in what you sell. Most sellers find out after the money is stuck. Standing finds out first."

### 2. 0:15–0:30: Try it without logging in (spike tool)
**Screen:** Scroll to "Would this spike stand out?". Type 120 for a normal day and 480 for today, and show the result.
**Say:** "Try it with your own numbers, no login. Four times a normal day: Standing would flag that. These thresholds
are ours, not PayPal's, and the page says so."

### 3. 0:30–0:45: Connect
**Screen:** Click "Try the demo" → Log in with PayPal (sandbox; cut the typing) → the dashboard, with the sidebar showing **verified**.
**Say:** "You log in with PayPal. Standing reads whether your account is verified, and your sales. Everything here is
PayPal's sandbox, with test money."

### 4. 0:45–1:10: What needs you
**Screen:** Dashboard top: "N things need you", the sales-spike and large-order cards. Scroll to "Where you stand" and
hover one tile's "Warns at 3×" line.
**Say:** "This morning's sales were several times a normal day, and one order was far bigger than usual. Those are
the signals PayPal lists. Standing checks them every fifteen minutes and tells you in plain words, with the numbers."

### 5. 1:10–1:35: A safe fix
**Screen:** "Physical orders without tracking" → Add tracking → type a tracking number, pick a carrier → the preview →
the 2-minute countdown (cut ahead) → PayPal's answer with its debug ID. Optionally show "Mark Completed" on a digital order.
**Say:** "Some things you can fix right now. Add tracking, and Standing shows exactly what it will send. You have two
minutes to cancel. Then it makes one call to PayPal, with a fixed request ID, so a double click can never send twice.
PayPal's answer is kept."

### 6. 1:35–2:00: Your case, before anyone asks
**Screen:** Build pack → the pack opens as a document. Click a citation number to jump to its evidence, then point at
the sales curve. Click Download PDF.
**Say:** "If PayPal does ask, your case is ready: a letter, your sales curve, your evidence. Every number in it is
written by code and cites its source. The AI only chooses and orders the facts, and a checker blocks anything it
can't verify."

### 7. 2:00–2:20: Ask Standing, and the refusal
**Screen:** Ask Standing → tap "Do I have any open alerts?" → answer with citation chips. Then type: "My invoice is
$4,000. Can I bill it as ten $400 charges so it doesn't get flagged?" → the refusal.
**Say:** "Ask questions in plain English; answers come from your own records. Ask it to help you dodge PayPal's checks,
and it says no, and why. Standing helps you stay in good standing. It never helps you hide."

### 8. 2:20–2:30: Every order, one table
**Screen:** Orders: switch quick views (Missing tracking, then Digital), show the totals, hover the CSV export.
**Say:** "Every PayPal payment in one table, with what PayPal says and what Standing checks, side by side."

### 9. 2:30–2:45: Proof and close
**Screen:** Homepage: the dark "The AI never writes a number" band, then "Honest results" with the misses. End on the
final call to action, "Be ready before PayPal asks."
**Say:** "We tested it on PayPal's real sandbox, and we publish our misses next to our wins, including a test set we
wrote before running it. Standing: your case is built before you need it."

---

**Before recording, check:**
- [ ] The demo-1109 burst orders are synced; the dashboard shows the spike, and the sidebar shows **verified**.
- [ ] The tracking you add uses realistic numbers. Build a **fresh pack** after adding it.
- [ ] The homepage numbers match `npm test` and TESTS.md today.
- [ ] Total length is under 3:00 on YouTube, not just in the editor. Set the video to Public or Unlisted.
- [ ] YouTube title: "Standing: stay in good standing with PayPal (PayPal AI Hackathon demo)".
