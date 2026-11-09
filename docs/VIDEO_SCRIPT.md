# Demo video script: target 2:50 (hard limit: under 3:00)

Approved 9 Nov. About 425 words: read at a brisk, natural pace (about 150 words a minute). The voice-over says what
each feature is for; on-screen highlights (zooms and captions) show how to use it.

**Rules for the recording**
- Only Standing's screens and PayPal's sandbox login page.
- No other brands on screen: hide the bookmarks bar, dock and other tabs. Use a clean browser profile. No music you don't own.
- Anything simulated must show its **Simulated** label when it appears.
- Never show `.env`, keys, tokens or test passwords. Type logins off camera, or cut that part.
- 1080p, browser zoom 110%, light mode. Record each scene as its own clip; it's easier to redo one.
- Spoken figures must match the screen. If the dashboard shows different numbers on the day, say "several times" or
  "far bigger" rather than a figure.

---

### 1. 0:00–0:22: The problem
**Screen:** Homepage hero, then scroll to "The problem: growth can look like risk". Highlight each quote card as it's spoken.
**Say:** "You run a small online shop. Then a post takes off, or a big order lands, and PayPal puts your money on hold.
PayPal publishes the reasons: you're a first-time seller, a sudden spike in sales, a change in your average price. And
those funds are usually held for up to twenty-one days. Three weeks without money for stock, right when you're busiest."

### 2. 0:22–0:45: Meet Standing
**Screen:** "How it works", highlighting Watch, Fix and Prove in turn, then the dark "The AI never writes a number" band.
**Say:** "PayPal's own pages talk about keeping your account 'in good standing'. So we built Standing. It watches your
PayPal records for the reasons PayPal lists, fixes the easy gaps, and builds your case before anyone asks. Plain code
works out every number and makes every PayPal call. The AI only explains and drafts, and a checker blocks anything it
can't back with evidence."

### 3. 0:45–0:53: Log in
**Screen:** Try the demo → PayPal sandbox login (cut the typing) → the dashboard. Highlight the sidebar account card:
the verified badge, "Synced…", the "Sandbox · test money" label and Log out.
**Say:** "Log in with PayPal. This is the sandbox, with test money. The sidebar shows your account, whether PayPal has
verified it, and when Standing last synced."

### 4. 0:53–1:20: Dashboard: what needs you
**Screen:** Highlight "N things need you": the sales-spike card, the large-order card and **Review orders**. Then
"Physical orders without tracking": **Add tracking**, type the number, pick the carrier, the preview, the 2-minute
countdown (cut ahead), and Sent with PayPal's ID. Then **Mark Completed** on a digital order.
**Say:** "The top shows what needs you. Today's sales are several times a normal day, and one order is far bigger than
usual. Below are gaps I can fix now. Add tracking: Standing shows exactly what goes to PayPal, gives me two minutes to
cancel, then sends it once and keeps PayPal's reply. Digital orders get marked Completed the same way."

### 5. 1:20–1:35: Where you stand
**Screen:** Zoom into one tile: its title, its figure, the Clear / Needs you badge, "Warns at…", and "PayPal's
published reason" next to "Standing's check".
**Say:** "'Where you stand' takes each reason PayPal publishes and shows my figure now, where Standing warns, and
whether that line comes from PayPal or from Standing. It's a reading, never PayPal's decision."

### 6. 1:35–1:47: Orders
**Screen:** Click the quick views, hover a column tooltip, show the "What each column means" key, hover Download CSV.
**Say:** "Orders lists every PayPal payment from the last ninety days. Quick views filter for missing tracking or
Seller Protection, the key explains every column, and it all exports to CSV."

### 7. 1:47–1:56: Evidence
**Screen:** Fill in "Add a supplier invoice", tick the Simulated box, and show the item in "What you've added" with its
Simulated badge.
**Say:** "Evidence is for what PayPal can't see: a supplier invoice, or the post that started the spike. Test data
gets labelled Simulated, everywhere."

### 8. 1:56–2:15: Packs
**Screen:** **Build a new pack** → the document opens. Click a citation number to jump to its evidence, show the sales
curve, then **Download PDF**.
**Say:** "Packs turns it all into your case: a letter to PayPal, your sales curve and numbered evidence. Every figure is
written by code and cites its source. If the AI's draft fails the check, the pack is blocked, not sent."

### 9. 2:15–2:28: Launch plan
**Screen:** Fill in the dashboard's Launch plan (date, expected ×, products), then Save. Highlight each product's
verdict with its quoted PayPal clause.
**Say:** "Planning a launch? Enter the date, how big you expect it, and the products. Standing checks each one against
PayPal's policy, quotes the clause, and builds a pack ahead of time."

### 10. 2:28–2:42: Ask Standing
**Screen:** Tap "Do I have any open alerts?" and show the answer with its source chips. Then type "My invoice is
$4,000. Can I bill it as ten $400 charges so it doesn't get flagged?" and show the refusal.
**Say:** "Ask Standing answers from your own records, with sources. Ask it to help dodge PayPal's checks, and it
refuses and explains why."

### 11. 2:42–2:54: Checklist and Catalogue
**Screen:** Checklist (steps with To do / Done). Then Catalogue: set "Digital pattern PDF", the one product left unclassified, to Digital, then Save.
**Say:** "The checklist is what to have ready, step by step. And the catalogue tells Standing which products are
physical or digital, so it checks tracking on the right orders."

### 12. 2:54–2:59: Close
**Screen:** Homepage final call to action.
**Say:** "Standing. Stay in good standing, before PayPal asks."

---

**Notes**
- "Good standing" is a paraphrase, not a quote: PayPal's Purchase Protection terms say "Have a PayPal account in good
  standing", but that page is about buyers, so the line says PayPal's pages "talk about" it.
- Cut for time: the homepage "Would this spike stand out?" tool and "Honest results". If one comes back, drop the
  Checklist line.

**Before recording, check:**
- [ ] The demo-1109 burst orders are synced; the dashboard shows the spike and the large order, and the sidebar shows **verified**.
- [ ] Every product but one is classified in the hosted Catalogue (the last one is classified on camera in scene 11).
- [ ] Tracking added uses realistic numbers (USPS, 22 digits). Build a **fresh pack** after adding it.
- [ ] The homepage numbers match `npm test` and TESTS.md today.
- [ ] Narration recorded and laid over each clip; total length under 3:00 on YouTube, not just in the editor. Set the video to Public or Unlisted.
- [ ] YouTube title: "Standing: stay in good standing with PayPal (PayPal AI Hackathon demo)".
