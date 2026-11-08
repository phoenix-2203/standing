import { ArrowRight, Code2, Eye, FileCheck2, ShieldCheck, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { Reveal } from "@/components/site/Reveal";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SpikeTool } from "@/components/site/SpikeTool";
import { Badge, ButtonLink, Timeline } from "@/components/ui";
import { BUILT_ON, HELD_OUT, HELD_OUT_MISSES, LOGIN, PROOF, QUOTES, README_RESULTS, REPO, TESTS_URL } from "@/lib/site/facts";
import fix from "../../public/site/fix.png";
import hero from "../../public/site/hero-dashboard.png";
import packReady from "../../public/site/pack-ready.png";
import prove from "../../public/site/prove.png";
import signal from "../../public/site/signal.png";
import watch from "../../public/site/watch.png";

export const metadata: Metadata = {
  title: { absolute: "Standing: keep your PayPal money moving" },
  description:
    "For small sellers on PayPal. Standing watches what PayPal watches, fixes what it safely can, and builds your case before anyone asks. A sandbox demo.",
};

const AI_TABLE: [string, string, string][] = [
  ["Numbers", "Computes every metric and writes every factual sentence", "Never writes a digit: its text is rejected if it does"],
  ["Explanation pack", "Writes the facts, checks the plan, blocks the pack if anything fails", "Picks facts by ID and their order; adds short linking sentences from an allowed list"],
  ["Policy check", "Confirms the clause exists and the quote is in it; otherwise says “unclear”", "Maps a product to a clause"],
  ["PayPal writes", "Everything: preview, cancel window, send, record", "Nothing. It can't call PayPal"],
  ["Refusals", "A rule-based guard runs first; the explanation is fixed text", "Decides the cases the guard doesn't catch"],
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
      <Reveal />
      <main id="main" className="lp">
        {/* Hero */}
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-copy">
              <p className="ui-eyebrow">For small sellers on PayPal</p>
              <h1 id="hero-title" className="lp-display">
                Your best week shouldn&apos;t be the week your money gets held.
              </h1>
              <p className="lp-lead">
                Standing watches what PayPal watches, fixes what it safely can, and builds your case before anyone asks. For small sellers on PayPal.
              </p>
              <div className="lp-cta">
                <ButtonLink href={LOGIN} prefetch={false} icon={<ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />}>
                  Try the demo
                </ButtonLink>
                <a href="#how" className="text-link">
                  See how it works
                </a>
              </div>
              <p className="status-line">Hackathon project · PayPal sandbox, test money · not affiliated with PayPal</p>
            </div>
            <div className="lp-hero-art">
              <div className="lp-glow" aria-hidden="true" />
              <figure className="window lp-window" aria-label="Standing's dashboard">
                <div className="window-bar" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <Image unoptimized src={hero} alt="Standing's dashboard: what needs the seller, and where they stand on each reason PayPal publishes" priority sizes="(min-width: 1024px) 640px, 100vw" />
                <figcaption className="window-label">Sandbox data</figcaption>
              </figure>
              <div className="lp-float lp-float-signal">
                <Image unoptimized src={signal} alt="A signal card from the app: Unusually large order, 5.1× the 28-day average order" sizes="340px" />
              </div>
              <div className="lp-float lp-float-pack">
                <Image unoptimized src={packReady} alt="The Your case card from the app, with an explanation pack marked ready" sizes="220px" />
              </div>
            </div>
          </div>
        </section>

        {/* Built on */}
        <section className="lp-wrap lp-built" aria-labelledby="built-title">
          <h2 id="built-title" className="lp-built-title">
            Built on PayPal&apos;s APIs
          </h2>
          <ul className="lp-chips">
            {BUILT_ON.map((api) => (
              <li key={api}>{api}</li>
            ))}
          </ul>
        </section>

        {/* Proof */}
        <section className="lp-wrap lp-proof reveal" aria-label="Results so far">
          {PROOF.map((p) => (
            <a key={p.label} href={p.href} className="lp-proof-item">
              <span className="lp-proof-figure">{p.figure}</span>
              <span className="lp-proof-label">{p.label}</span>
            </a>
          ))}
        </section>

        {/* The problem */}
        <section className="lp-wrap lp-section" aria-labelledby="problem-title">
          <div className="lp-head reveal">
            <h2 id="problem-title" className="lp-title">
              The problem, in PayPal&apos;s own words
            </h2>
            <p className="lp-sub">The moment a small seller finally takes off is one of the moments PayPal looks hardest.</p>
          </div>
          <div className="lp-quotes">
            {QUOTES.map((q) => (
              <figure key={q.text} className="lp-card lp-quote reveal">
                <blockquote>“{q.text}”</blockquote>
                <figcaption>
                  <a href={q.href}>{q.source}</a>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="lp-wrap lp-section" id="how" aria-labelledby="how-title">
          <div className="lp-head reveal">
            <h2 id="how-title" className="lp-title">
              How it works
            </h2>
            <p className="lp-sub">Three jobs, all on your own PayPal records. These are the app&apos;s real screens, on sandbox data.</p>
          </div>
          <div className="lp-bento">
            <article className="lp-card lp-tile lp-tile-big reveal">
              <div className="lp-tile-copy">
                <span className="lp-tile-num">01</span>
                <h3>
                  <Eye size={20} strokeWidth={1.75} aria-hidden="true" /> Watch
                </h3>
                <p>
                  Every 15 minutes Standing checks your PayPal records for the patterns PayPal lists: a spike, a jump in order size, a new kind of product,
                  missing tracking.
                </p>
              </div>
              <div className="lp-tile-shot">
                <Image unoptimized src={watch} alt="Standing's 'Where you stand' tiles: each reason PayPal publishes, the seller's figure now and Standing's reading" sizes="(min-width: 900px) 600px, 100vw" />
              </div>
            </article>
            <article className="lp-card lp-tile reveal">
              <div className="lp-tile-copy">
                <span className="lp-tile-num">02</span>
                <h3>
                  <Wrench size={20} strokeWidth={1.75} aria-hidden="true" /> Fix
                </h3>
                <p>What can be fixed safely, such as tracking or marking a digital order Completed, goes through a queue you preview and can cancel.</p>
              </div>
              <div className="lp-tile-shot">
                <Image unoptimized src={fix} alt="Standing's orders table: each PayPal payment with its items, tracking and Seller Protection status" sizes="(min-width: 900px) 520px, 100vw" />
              </div>
            </article>
            <article className="lp-card lp-tile reveal">
              <div className="lp-tile-copy">
                <span className="lp-tile-num">03</span>
                <h3>
                  <FileCheck2 size={20} strokeWidth={1.75} aria-hidden="true" /> Prove
                </h3>
                <p>An explanation pack: your sales curve and a letter where every figure is written by code and cites its evidence.</p>
              </div>
              <div className="lp-tile-shot">
                <Image unoptimized src={prove} alt="A cover letter in Standing's explanation pack, with numbered citations to evidence" sizes="(min-width: 900px) 520px, 100vw" />
              </div>
            </article>
          </div>
        </section>

        {/* Spike tool */}
        <section className="lp-wrap lp-section" id="try" aria-labelledby="try-title">
          <div className="lp-spike reveal">
            <div className="lp-head">
              <h2 id="try-title" className="lp-title">
                Would this spike stand out?
              </h2>
              <p className="lp-sub">Try your own numbers. No login, nothing sent anywhere.</p>
            </div>
            <SpikeTool />
          </div>
        </section>

        {/* The dark band */}
        <section className="lp-band" aria-labelledby="ai-title">
          <div className="lp-wrap">
            <div className="lp-head reveal">
              <p className="lp-band-eyebrow">Where the AI stops</p>
              <h2 id="ai-title" className="lp-band-title">
                The AI never writes a number.
              </h2>
              <p className="lp-band-sub">A letter to PayPal with one invented figure could do more harm than no letter. So code owns every number, and the AI only picks and links.</p>
            </div>
            <div className="lp-compare reveal" role="table" aria-label="What code does and what the AI does">
              <div className="lp-compare-row lp-compare-head" role="row">
                <span role="columnheader">
                  <span className="sr-only">Area</span>
                </span>
                <span role="columnheader">Code does this</span>
                <span role="columnheader">The AI does this</span>
              </div>
              {AI_TABLE.map(([what, code, ai]) => (
                <div key={what} className="lp-compare-row" role="row">
                  <span role="rowheader" className="lp-compare-what">
                    {what}
                  </span>
                  <span role="cell">{code}</span>
                  <span role="cell" className="lp-compare-ai">
                    {ai}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Safe fixes */}
        <section className="lp-wrap lp-section lp-split" aria-labelledby="fix-title">
          <div className="lp-head reveal">
            <h2 id="fix-title" className="lp-title">
              Nothing reaches PayPal without your say
            </h2>
            <p className="lp-sub">Every write to PayPal goes through the same four steps, in plain code. The AI can&apos;t start one.</p>
          </div>
          <div className="lp-card lp-flow reveal">
            <p className="lp-flow-label">Example: adding tracking to an order</p>
            <Timeline
              label="How a fix reaches PayPal"
              steps={[
                { title: "Preview", detail: "You see exactly what will be sent to PayPal.", state: "done" },
                { title: "2-minute window", detail: "Cancel any time before it goes.", state: "current" },
                { title: "One send", detail: "A stable request ID, so a double click or retry makes one call.", state: "upcoming" },
                { title: "PayPal's answer kept", detail: "Stored with its debug ID. A timeout is “unknown”, never “failed”.", state: "upcoming" },
              ]}
            />
          </div>
        </section>

        {/* Honest results */}
        <section className="lp-wrap lp-section" aria-labelledby="results-title">
          <div className="lp-head reveal">
            <h2 id="results-title" className="lp-title">
              Honest results
            </h2>
            <p className="lp-sub">
              A held-out set, run once on 7 Nov 2026 with the rules written first. Small, and written for this project, so read it as a check, not a
              benchmark.
            </p>
          </div>
          <div className="lp-results reveal">
            <div className="lp-card lp-table-card">
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
            </div>
            <div className="lp-card lp-misses">
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
        <section className="lp-wrap lp-section" aria-labelledby="faq-title">
          <div className="lp-head reveal">
            <h2 id="faq-title" className="lp-title">
              Questions
            </h2>
          </div>
          <div className="lp-faq reveal">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="lp-final" aria-labelledby="cta-title">
          <div className="lp-wrap lp-final-inner reveal">
            <ShieldCheck size={32} strokeWidth={1.5} aria-hidden="true" className="lp-final-icon" />
            <h2 id="cta-title" className="lp-display lp-display-sm">
              Be ready before PayPal asks.
            </h2>
            <div className="lp-cta">
              <ButtonLink href={LOGIN} prefetch={false} icon={<ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />}>
                Try the demo
              </ButtonLink>
              <ButtonLink href={REPO} variant="secondary" icon={<Code2 size={16} strokeWidth={1.75} aria-hidden="true" />}>
                Read the code
              </ButtonLink>
            </div>
            <p className="status-line">PayPal sandbox only, test money · not affiliated with PayPal</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
