// Citation validator (CLAUDE.md rule 6): blocks a pack unless every sentence cites existing evidence and
// says nothing the cited evidence doesn't. Deterministic; the model has no say in whether a pack passes.
//
// A sentence is blocked when it:
//  - has no citation, or cites an ID that isn't an offered evidence item (exact match, no normalising);
//  - puts an evidence ID in its text;
//  - contains hidden characters (zero-width, bidi controls) that could split or disguise tokens;
//  - has a number, date or ID that isn't, exactly, in the evidence it cites; or a number written as a word;
//  - uses a content word that is neither in the cited evidence nor in the small list of letter words
//    below (so "trusted", "loyal customers", "sales doubled" fail unless the evidence says so);
//  - uses a negation the cited evidence doesn't use ("no tracking was missing");
//  - makes a claim needing a kind of evidence it doesn't cite (delivered, invoice, traffic, disputes…);
//  - predicts, promises or asks for a PayPal decision;
//  - cites a simulated item without calling it simulated.

export interface CitableEvidence {
  id: string;
  kind: string;
  summary: string;
  simulated: boolean;
}

export interface Problem {
  paragraph: number;
  sentence: number;
  text: string;
  problem: string;
}

export interface Validation {
  ok: boolean;
  problems: Problem[];
}

const MAX_SENTENCES = 40;
const MAX_SENTENCE_CHARS = 400;

// Words a letter needs that carry no factual claim of their own.
const LETTER_WORDS = new Set(
  (
    "the a an and or of to in on for with by from at as is are was were be been being this that these those it its " +
    "our we my me i us their they them which who whom whose has have had also both during between after before since " +
    "period seller shop store business payment payments paypal order orders sale sales customer customers buyer buyers " +
    "received recorded shows show listed lists attached evidence item items account review team day days daily " +
    "following include includes including detail details below above here there number amount amounts dated date dates " +
    "thank thanks you your please consider attention provide provides provided information record records summary " +
    "documented reflects reflect explain explains context matches match matched corresponds consistent while when where " +
    "what each per same those all its these into out over under within about these such than then so but because " +
    "would like help understand reviewing recent activity letter write writing describe described"
  ).split(/\s+/),
);

const NUMBER_WORDS =
  /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|dozen|half|twice|double|doubled|triple|tripled|quadruple)\b/i;
const NEGATIONS = /\b(not|no|never|none|nothing|without|neither|nor)\b|n't\b/i;
const PREDICTIONS =
  /\b(paypal|you|your team)\s+(will|would|should|must|can)\b|\b(will|would|should)\s+(be\s+)?(release|released|lift|lifted|remove|removed|restore|restored|unlock|unlocked|approve|approved)\b|\b(guarantee|guaranteed|promise|promised|assure|assured|certainly|definitely)\b|\bplease\s+(release|lift|remove|restore|unlock|approve)\b/i;
const HIDDEN = /[​-‏‪-‮⁠-⁤﻿­]/;
const EVIDENCE_ID_IN_TEXT = /\bEV-[A-Z]+-/i;

// A claim word needs one of these evidence kinds among the sentence's citations.
const CLAIMS: { words: RegExp; kinds: string[]; what: string }[] = [
  { words: /\b(delivered|delivery|deliveries|received by)\b/i, kinds: ["delivery", "digital_delivery"], what: "delivery" },
  { words: /\b(tracking|tracked|shipped|shipping|dispatched)\b/i, kinds: ["delivery", "sales_summary"], what: "tracking" },
  { words: /\b(completed)\b/i, kinds: ["digital_delivery", "sales_summary"], what: "Completed status" },
  { words: /\b(invoice|invoices|supplier|suppliers|stock|inventory|wholesale)\b/i, kinds: ["invoice"], what: "a supplier invoice" },
  { words: /\b(video|videos|viral|tiktok|instagram|youtube|facebook|post|posts|campaign|influencer|advert|advertising|traffic|featured)\b/i, kinds: ["traffic_source"], what: "a traffic source" },
  { words: /\b(dispute|disputes|chargeback|chargebacks|complaint|complaints)\b/i, kinds: ["sales_summary"], what: "dispute figures" },
];

const stem = (w: string) => w.toLowerCase().replace(/(ies|es|s|ed|ing|ly)$/, "");

export function validateLetter(letter: unknown, offered: CitableEvidence[]): Validation {
  const problems: Problem[] = [];
  const add = (p: number, s: number, text: string, problem: string) => problems.push({ paragraph: p, sentence: s, text, problem });

  const paragraphs = (letter as { paragraphs?: unknown })?.paragraphs;
  if (!Array.isArray(paragraphs) || !paragraphs.length) return { ok: false, problems: [{ paragraph: -1, sentence: -1, text: "", problem: "letter doesn't match the schema" }] };

  const byId = new Map(offered.map((e) => [e.id, e]));
  let count = 0;
  paragraphs.forEach((para, p) => {
    const sentences = (para as { sentences?: unknown })?.sentences;
    if (!Array.isArray(sentences) || !sentences.length) return add(p, -1, "", "paragraph has no sentences");
    sentences.forEach((raw, s) => {
      count++;
      const { text, citations } = (raw ?? {}) as { text?: unknown; citations?: unknown };
      if (typeof text !== "string" || !Array.isArray(citations) || citations.some((c) => typeof c !== "string")) {
        return add(p, s, String(text ?? ""), "sentence doesn't match the schema");
      }
      if (HIDDEN.test(text) || citations.some((c) => HIDDEN.test(c as string))) return add(p, s, text, "contains hidden characters");
      const t = text.normalize("NFKC").trim();
      if (!t) return add(p, s, text, "empty sentence");
      if (t.length > MAX_SENTENCE_CHARS) return add(p, s, text, "sentence too long");

      if (!citations.length) return add(p, s, text, "cites no evidence");
      const missing = (citations as string[]).filter((c) => !byId.has(c));
      if (missing.length) return add(p, s, text, `cites missing evidence ID ${missing.join(", ")}`);
      if (EVIDENCE_ID_IN_TEXT.test(t)) return add(p, s, text, "puts an evidence ID in the sentence text");

      const cited = (citations as string[]).map((c) => byId.get(c)!);
      const ground = cited.map((e) => e.summary.normalize("NFKC")).join(" \n ");

      // Specific checks first, so the seller sees the most useful reason.
      if (PREDICTIONS.test(t)) return add(p, s, text, "predicts, promises or asks for a PayPal decision");
      for (const c of CLAIMS) {
        if (c.words.test(t) && !cited.some((e) => c.kinds.includes(e.kind))) return add(p, s, text, `claims ${c.what} without citing it`);
      }
      if (NUMBER_WORDS.test(t)) return add(p, s, text, `writes a number as a word ("${t.match(NUMBER_WORDS)![0]}")`);
      const ungroundedToken = tokensWithDigits(t).find((tok) => !hasToken(ground, tok));
      if (ungroundedToken) return add(p, s, text, `"${ungroundedToken}" isn't in the cited evidence`);

      const groundWords = new Set((ground.toLowerCase().match(/[a-z]+/g) ?? []).map(stem));
      const unsupported = (t.toLowerCase().replace(/\bn't\b/g, " not").match(/[a-z]+/g) ?? [])
        .filter((w) => w.length >= 3 && !LETTER_WORDS.has(w) && !groundWords.has(stem(w)) && !NEGATIONS.test(w));
      if (unsupported.length) return add(p, s, text, `unsupported claim: "${[...new Set(unsupported)].join('", "')}" isn't in the cited evidence`);

      const neg = t.match(NEGATIONS);
      if (neg && !new RegExp(`\\b${neg[0].replace("'", "")}`, "i").test(ground) && !(neg[0].toLowerCase() === "n't" && /\bnot\b/i.test(ground))) {
        return add(p, s, text, `negation "${neg[0]}" isn't in the cited evidence`);
      }
      if (cited.some((e) => e.simulated) && !/\bsimulated\b/i.test(t)) return add(p, s, text, "cites simulated evidence without saying it is simulated");
    });
  });
  if (count > MAX_SENTENCES) problems.push({ paragraph: -1, sentence: -1, text: "", problem: `letter has ${count} sentences (max ${MAX_SENTENCES})` });
  return { ok: problems.length === 0, problems };
}

/** Every token containing a digit: amounts, dates, counts, payment and tracking IDs. Commas in numbers are dropped. */
function tokensWithDigits(text: string): string[] {
  return (text.match(/[A-Za-z0-9][A-Za-z0-9.,:/$-]*/g) ?? [])
    .map((tok) => tok.replace(/^\$/, "").replace(/(\d),(?=\d{3}\b)/g, "$1").replace(/[.,:/-]+$/, ""))
    .filter((tok) => /\d/.test(tok));
}

/** The token appears in the evidence as a whole token: "38" doesn't match "38.00", "4" doesn't match "04". */
function hasToken(ground: string, tok: string): boolean {
  const g = ground.replace(/(\d),(?=\d{3}\b)/g, "$1");
  const esc = tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9.])${esc}(?![A-Za-z0-9]|\\.\\d)`).test(g);
}
