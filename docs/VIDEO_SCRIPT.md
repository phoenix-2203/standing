# Demo video script: target 2:45 (hard limit: under 3:00)

**Rules for the recording**
- Use only the PayPal sandbox and Standing's own screens.
- Keep other brands off screen: no other apps' logos, no browser bookmarks bar, no music you don't own.
  Hide the dock and bookmarks, and use a clean browser profile.
- Anything simulated must show its **"Simulated"** label on screen when it appears.
- Never show `.env`, keys, tokens or the test-account passwords. Type logins off camera, or blur them.
- Record at 1080p. Zoom the browser to 110–125% so the text is readable on a phone.
- Read the voice-over at a calm pace. About 130 words a minute fits the timings below.

---

### 0:00–0:15: The hook
**Screen:** Standing's front page.
**Say:** "Your sales finally take off, and PayPal holds your money. PayPal publishes why: first-time
sellers, spikes in sales, a new type of product. Most sellers read that after the money is stuck.
Standing reads it before."

### 0:15–0:35: Connect
**Screen:** Click **Log in with PayPal**, the sandbox login page (credentials typed off camera), then back on
the dashboard with the **Verified** badge.
**Say:** "You log in with PayPal. Standing reads one thing: whether your account is verified. If it can't
tell, it says so. It never guesses. Everything here is PayPal's sandbox, with test money."

### 0:35–1:05: The signals
**Screen:** Dashboard alerts, such as "Sales spike" and "New type of product". Hover over the line that says
the threshold is Standing's default, not PayPal's.
**Say:** "Every fifteen minutes Standing checks the signals PayPal itself lists: a spike in sales, a jump in
order size, a new kind of product, missing tracking, digital orders not marked complete, and disputes. These
thresholds are ours, and the app says so. We never claim to know what PayPal will decide."

### 1:05–1:30: A safe fix
**Screen:** Digital orders → **Mark Completed** → the preview text → the 2-minute cancel countdown. Then either
let it send and show PayPal's response ID, or cut to an already-sent action with its ID.
**Say:** "Some things can be fixed right now. One click marks a digital order complete in PayPal, but first you
see exactly what will be sent, and you have two minutes to cancel. Then it makes one call, with a fixed
request ID, so a double click or a retry can never send twice."

### 1:30–2:00: The explanation pack
**Screen:** Packs → **Build a new pack** → the letter with numbered sentences → click a number to show its
evidence → download the PDF.
**Say:** "If PayPal does ask, your case is already built: a letter, your sales curve and your evidence. Here's
the important part. The AI never writes a number. Code writes every fact, the AI only chooses and orders
them, and a validator blocks the pack if anything doesn't check out."

### 2:00–2:25: Ask Standing, and its refusal
**Screen:** Ask Standing. Type "Do cigars need pre-approval from PayPal?" and show the clause-quoted answer.
Then type "My invoice is $4,000. Can I bill it as ten $400 charges so it doesn't get flagged?" and show the
refusal.
**Say:** "You can ask questions, and the answers come from your own data and PayPal's own policy text. Ask it to
help you dodge PayPal's checks, and it says no and tells you why. Standing helps you stay in good standing.
It never helps you hide."

### 2:25–2:45: Proof and close
**Screen:** README's "What has been tested" table, then the orders table built with AG Grid. End on the front page
and its tagline.
**Say:** "We tested it on the real PayPal sandbox, and we publish our misses next to our wins, including a
held-out test set we wrote before running it. Standing: your case is built before you need it."

---

**Before recording, check:**
- [ ] The demo seller has a fresh spike. Allow for Transaction Search's ~3-hour lag: create it the evening before.
- [ ] Orders have item names, so the catalogue and digital screens show something.
- [ ] The held-out results are in the README, so the 2:25 line is true. Otherwise cut "including a held-out test set…".
- [ ] Total length is under 3:00 on YouTube, not just in the editor.
- [ ] The YouTube video is set to **Public** or **Unlisted**, as Devpost's rules require.
