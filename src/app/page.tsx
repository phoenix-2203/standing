import { ArrowRight, Eye, FileCheck2, ShieldCheck, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SpikeTool } from "@/components/site/SpikeTool";
import { Badge, ButtonLink } from "@/components/ui";
import { HELD_OUT, HELD_OUT_MISSES, LOGIN, PROOF, QUOTES, README_RESULTS, REPO, TESTS_URL } from "@/lib/site/facts";
import hero from "../../public/site/hero-dashboard.png";
import fix from "../../public/site/fix.png";
import prove from "../../public/site/prove.png";
import watch from "../../public/site/watch.png";

export const metadata: Metadata = {
  title: { absolute: "Standing: keep your PayPal money moving" },
  description:
    "For small sellers on PayPal. Standing watches the signals PayPal publishes for holding funds, fixes what it safely can, and builds your case before anyone asks. A sandbox demo.",
};

const STEPS = [
  {
    icon: Eye,
    name: "Watch",
    text: "Every 15 minutes Standing checks your PayPal records for the patterns PayPal lists: a spike, a jump in order size, a new kind of product, missing tracking.",
    img: watch,
    alt: "Standing's 'Where you stand' table: each reason PayPal publishes, the seller's figure now and Standing's reading",
  },
  {
    icon: Wrench,
    name: "Fix",
    text: "What can be fixed safely, such as tracking or marking a digital order Completed, goes through a queue you preview and can cancel.",
    img: fix,
    alt: "Standing's orders table, showing each PayPal payment with its items, tracking and Seller Protection status",
  },
  {
    icon: FileCheck2,
    name: "Prove",
    text: "An explanation pack: your sales curve and a letter where every figure is written by code and cites its evidence.",
    img: prove,
    alt: "A cover letter in Standing's explanation pack, with numbered citations to evidence",
  },
];

const AI_TABLE: [string, string, string][] = [
  ["Numbers", "Computes every metric and writes every factual sentence", "Never writes a digit: its text is rejected if it does"],
  ["Explanation pack", "Writes the facts, checks the plan, blocks the pack if anything fails", "Picks facts by ID and their order; adds short linking sentences from an allowed list"],
  ["Policy check", "Confirms the clause exists and the quote is in it; otherwise says “unclear”", "Maps a product to a clause"],
  ["PayPal writes", "Everything: preview, cancel window, send, record", "Nothing. It can't call PayPal"],
  ["Refusals", "A rule-based guard runs first; the explanation is fixed text", "Decides the cases the guard doesn't catch"],
];

const FIX_STEPS = [
  ["Preview", "You see exactly what will be sent to PayPal."],
  ["2-minute window", "Cancel any time before it goes."],
  ["One send", "A stable request ID, so a double click or retry makes one call."],
  ["PayPal's answer kept", "Stored with its debug ID. A timeout is “unknown”, never “failed”."],
];

const FAQ: [string, string][] = [
  ["Is this affiliated with PayPal?", "No. Standing is an independent hackathon project. It uses PayPal's public APIs, in the sandbox only."],
  ["Does it move money?", "No. It runs on PayPal's sandbox with test money. The only things it can send to PayPal are order details such as tracking, and only after your preview and a 2-minute window to cancel."],
  [
    "What does the AI see?",
    "Figures and sentences Standing's code has already worked out, short summaries of your evidence, product names and your question. Never your PayPal login or tokens. The AI can't call PayPal and can't write a number into your letter.",
  ],
  [
    "What if PayPal still holds my funds?",
    "PayPal decides, and Standing never claims otherwise. What Standing gives you is a case that's ready: your records in order and a letter with every figure sourced.",
  ],
  ["Why sandbox only?", "It's a demo built in a few weeks. Real money needs PayPal partner access, a security review and support, which a hackathon project doesn't have. The code refuses any non-sandbox PayPal address."],
  ["Is it open source?", "Yes, under the MIT licence. The code, tests and every result, including the misses, are on GitHub."],
];

export default function Home() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="site">
        {/* Hero */}
        <section className="hero2" aria-labelledby="hero-title">
          <div className="hero2-copy">
            <p className="ui-eyebrow">For small sellers on PayPal</p>
            <h1 id="hero-title" className="display">
              Your best week shouldn&apos;t be the week your money gets held.
            </h1>
            <p className="lead2">
              PayPal publishes why it holds funds. Standing watches for those signals in your account, fixes what it safely can, and builds your case
              before anyone asks.
            </p>
            <div className="hero2-cta">
              <ButtonLink href={LOGIN} prefetch={false} icon={<ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />}>
                Try the sandbox demo
              </ButtonLink>
              <a href="#how" className="text-link">
                See how it works
              </a>
            </div>
            <p className="status-line">Hackathon project · PayPal sandbox only, test money · not affiliated with PayPal</p>
          </div>
          <figure className="window" aria-label="Standing's dashboard">
            <div className="window-bar" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <Image src={hero} alt="Standing's dashboard: what needs the seller, and where they stand on each reason PayPal publishes" priority sizes="(min-width: 1024px) 640px, 100vw" />
            <figcaption className="window-label">Sandbox data</figcaption>
          </figure>
        </section>

        {/* Proof strip */}
        <section className="proof" aria-label="Results so far">
          {PROOF.map((p) => (
            <a key={p.label} href={p.href} className="proof-item">
              <span className="proof-figure">{p.figure}</span>
              <span className="proof-label">{p.label}</span>
            </a>
          ))}
        </section>

        {/* The problem */}
        <section className="section" aria-labelledby="problem-title">
          <h2 id="problem-title" className="section-title">
            The problem, in PayPal&apos;s own words
          </h2>
          <p className="section-lead">The moment a small seller finally takes off is one of the moments PayPal looks hardest.</p>
          <div className="quotes">
            {QUOTES.map((q) => (
              <figure key={q.text} className="quote">
                <blockquote>“{q.text}”</blockquote>
                <figcaption>
                  <a href={q.href}>{q.source}</a>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="section" id="how" aria-labelledby="how-title">
          <h2 id="how-title" className="section-title">
            How it works
          </h2>
          <ol className="steps">
            {STEPS.map(({ icon: Icon, name, text, img, alt }, i) => (
              <li key={name} className="step">
                <div className="step-copy">
                  <span className="step-num">0{i + 1}</span>
                  <h3>
                    <Icon size={20} strokeWidth={1.75} aria-hidden="true" /> {name}
                  </h3>
                  <p>{text}</p>
                </div>
                <div className="step-shot">
                  <Image src={img} alt={alt} sizes="(min-width: 1024px) 560px, 100vw" />
                  <span className="window-label">Real screen · sandbox data</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Spike tool */}
        <section className="section" id="try" aria-labelledby="try-title">
          <h2 id="try-title" className="section-title">
            Would this spike stand out?
          </h2>
          <p className="section-lead">Try your own numbers. No login.</p>
          <SpikeTool />
        </section>

        {/* Where the AI stops */}
        <section className="section" aria-labelledby="ai-title">
          <h2 id="ai-title" className="section-title">
            Where the AI stops
          </h2>
          <p className="section-lead">A letter to PayPal with one invented number could do more harm than no letter. So code owns every number.</p>
          <div className="compare" role="table" aria-label="What code does and what the AI does">
            <div className="compare-row compare-head" role="row">
              <span role="columnheader">
                <span className="sr-only">Area</span>
              </span>
              <span role="columnheader">Code does this</span>
              <span role="columnheader">The AI does this</span>
            </div>
            {AI_TABLE.map(([what, code, ai]) => (
              <div key={what} className="compare-row" role="row">
                <span role="rowheader" className="compare-what">
                  {what}
                </span>
                <span role="cell">{code}</span>
                <span role="cell" className="muted">
                  {ai}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Safe fixes */}
        <section className="section" aria-labelledby="fix-title">
          <h2 id="fix-title" className="section-title">
            Nothing reaches PayPal without your say
          </h2>
          <ol className="flow">
            {FIX_STEPS.map(([t, d], i) => (
              <li key={t}>
                <span className="flow-num">{i + 1}</span>
                <strong>{t}</strong>
                <span className="muted">{d}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Honest results */}
        <section className="section" aria-labelledby="results-title">
          <h2 id="results-title" className="section-title">
            Honest results
          </h2>
          <p className="section-lead">
            A held-out set, run once on 7 Nov 2026 with the rules written first. Small, and written for this project, so read it as a check, not a
            benchmark.
          </p>
          <div className="results">
            <table>
              <thead>
                <tr>
                  <th scope="col">Check</th>
                  <th scope="col">Target</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {HELD_OUT.map((r) => (
                  <tr key={r.check}>
                    <td>{r.check}</td>
                    <td className="mono">{r.target}</td>
                    <td>
                      <Badge tone={r.ok ? "ok" : "bad"}>{r.result}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="misses">
              <h3>The misses</h3>
              <ul>
                {HELD_OUT_MISSES.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <p>
                <a href={TESTS_URL}>Every run, with PayPal debug IDs</a> · <a href={README_RESULTS}>The tuned sets too</a>
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="section" aria-labelledby="faq-title">
          <h2 id="faq-title" className="section-title">
            Questions
          </h2>
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="final-cta" aria-labelledby="cta-title">
          <ShieldCheck size={28} strokeWidth={1.5} aria-hidden="true" />
          <h2 id="cta-title" className="display-sm">
            Be ready before PayPal asks.
          </h2>
          <div className="hero2-cta">
            <ButtonLink href={LOGIN} prefetch={false}>
              Try the sandbox demo
            </ButtonLink>
            <a href={REPO} className="text-link">
              Read the code
            </a>
          </div>
          <p className="status-line">PayPal sandbox only, test money · not affiliated with PayPal</p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
