# Raw app clips for the Standing film

Claude (in chat) is making the film: voice, title cards, music, edit and subtitles. This file only asks for **raw app
footage**. Use the existing recorder (`scripts/video/rec.mjs` and `scenes.mjs`) against the local app with real
sandbox data, **with these changes**:

- **No captions:** make `caption()` a no-op when `CAPTIONS=0`. Subtitles are burned in later.
- **No narration and no audio.**
- Keep the cursor, click press and highlight ring. Keep 1920×1080. Light mode.
- The account panel must show **verified**: sync from the verified login, or set the stored connection to the verified
  sandbox account the honest way (log in with it).
- Use the 9 Nov burst data, so the dashboard shows the sales spike and the large order.
- Hold ~1.5 s still at the start and end of every clip (the edit needs handles).
- Write each clip as `video/clips/<name>.mp4` (H.264, CRF 16, 30 fps) and `video/clips/<name>.json` with **marks**:
  seconds from the clip's start where each named moment happens, plus `{x, y, w, h}` boxes (1920×1080 frame pixels)
  for anything the edit should zoom into. Add `video/clips/` to `.gitignore`.

| Clip | What to record | Marks (and boxes) |
|---|---|---|
| `v_home` | Homepage hero, hold 2 s. Smooth scroll to the "Would this spike stand out?" tool. Clear the fields, type **120** (normal day), then **480** (today), leaving largest order empty. Ring the result for 3 s | `tool`, `typed`, `result` (box: the result panel) |
| `v_connect` | Homepage top. Move to and click **Try the demo**, then cut (pause) to the dashboard top. Ring the account panel showing **verified** for 2.5 s. Don't show the PayPal login page or any typing | `click`, `dash`, `verified` (box: account panel) |
| `v_dashboard` | Dashboard top, hold. Ring the sales-spike card (2.5 s), then the large-order card (2.5 s). Scroll to "Where you stand", ring the spike tile (2 s), then hover its "Warns at" line | `needs`, `spike` (box), `large` (box), `stand`, `threshold` |
| `v_fix` | Physical orders → **Add tracking** on one burst order → type `9400111899562118430953`, carrier USPS → the preview → hold on the 2-minute countdown for 3 s → pause off camera until sent → resume on PayPal's answer with its debug ID, ringed for 3 s | `open`, `typed`, `preview` (box), `countdown`, `sent`, `answer` (box) |
| `v_pack` | Packs → **Build a new pack** (wait off camera for it) → the document top → click citation **3** so it jumps to its evidence (ring 2 s) → scroll to the sales curve (2 s) → hover **Download PDF** | `built`, `cite`, `evidence` (box), `curve`, `pdf` |
| `v_ask` | Ask Standing → click the suggestion "Do I have any open alerts?" → answer (wait off camera) and ring it 2.5 s → type "My invoice is $4,000. Can I bill it as ten $400 charges so it doesn't get flagged?" → refusal, ringed 3 s | `answer` (box), `typed`, `refusal` (box) |
| `v_orders` | Orders: hold, click the quick views **Missing tracking**, then **All orders**; ring the totals, then hover **Download CSV** | `views`, `totals` (box), `csv` |

Then check that every clip opens and that its marks match, and list each clip's length. **Don't commit the MP4s.**
Commit only the recorder change (`CAPTIONS=0`), the clip specs and `.gitignore`, then push. Report when it's done.
Claude in chat will pick the clips up from `video/clips/`.
