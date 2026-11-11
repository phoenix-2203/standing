import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "@/components/site/DocPage";
import { REPO } from "@/lib/site/facts";

export const metadata: Metadata = {
  title: "Guide",
  description: "How to use Standing: the demo, a 5-minute tour, every page, and answers to common questions.",
};

const TOC = [
  { id: "start", label: "Two ways in" },
  { id: "tour", label: "A 5-minute tour" },
  { id: "pages", label: "Every page" },
  { id: "demo", label: "The demo workspace" },
  { id: "faq", label: "FAQ" },
];

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "Can Standing get my money released?",
    a: "No. Only PayPal can release a hold. Standing helps you put right what PayPal can check, and have your case ready if PayPal asks.",
  },
  {
    q: "Does the AI decide anything about my money?",
    a: "No. Code computes every number and makes every PayPal call, only after you confirm. The AI picks which facts to include and explains them; a checker blocks anything it can't trace to your records.",
  },
  {
    q: "Are the alert thresholds PayPal's rules?",
    a: "No. PayPal publishes the reasons it may hold funds, but not the numbers it uses. Standing's thresholds are its own defaults, and the app says so.",
  },
  {
    q: "Can it send something to PayPal by accident?",
    a: "Every write shows a preview and a 2-minute cancel window, then makes one call with a fixed request ID, so a double click can't send twice.",
  },
  { q: "Is this real money?", a: "No. Standing runs only on PayPal's sandbox, with test money." },
  {
    q: "Will it help me get around a review?",
    a: "No. It refuses requests like splitting payments, opening extra accounts or describing products as something else, and explains why: those look like hiding, and can turn a hold into something worse.",
  },
  {
    q: "What does Standing store?",
    a: (
      <>
        Your PayPal payments, alerts and the evidence you add, so it can build your case. Credentials are never shown or logged. See{" "}
        <Link href="/privacy">Privacy</Link>.
      </>
    ),
  },
  {
    q: "Is Standing affiliated with PayPal?",
    a: (
      <>
        No. It&apos;s an independent hackathon project, open source under the <a href={`${REPO}/blob/main/LICENSE`}>MIT licence</a>.
      </>
    ),
  },
];

export default function GuidePage() {
  return (
    <DocPage title="How to use Standing" lead="The demo, a 5-minute tour, what every page is for, and answers to common questions.">
      <nav className="guide-toc" aria-label="On this page">
        <p className="guide-toc-title">On this page</p>
        <ol>
          {TOC.map((t) => (
            <li key={t.id}>
              <a href={`#${t.id}`}>{t.label}</a>
            </li>
          ))}
        </ol>
      </nav>

      <section aria-labelledby="start" className="guide-sec">
        <h2 id="start">Two ways in</h2>
        <ul>
          <li>
            <strong>Try the demo (no login).</strong> Click &ldquo;Try the demo&rdquo; on the home page. You get your own private copy of a demo candle
            shop on PayPal&apos;s sandbox. Click anything: nothing you do affects anyone else. Sends to PayPal are simulated and labelled. The copy is
            deleted after 48 hours.
          </li>
          <li>
            <strong>Log in with PayPal.</strong> Connect a PayPal sandbox business account. Standing reads your payments and account status, and only
            writes to PayPal when you confirm a fix.
          </li>
        </ul>
      </section>

      <section aria-labelledby="tour" className="guide-sec">
        <h2 id="tour">A 5-minute tour</h2>
        <ol className="guide-steps">
          <li>
            <strong>Dashboard: what needs you.</strong> Each alert says what Standing saw, with the numbers, and has a button to fix it.
          </li>
          <li>
            <strong>Where you stand.</strong> The signals PayPal itself lists for holds: a sudden sales spike, a change in order size, a new kind of
            product, missing tracking, digital orders not marked Completed, and disputes. Checked every 15 minutes.
          </li>
          <li>
            <strong>Fix something safely.</strong> Click &ldquo;Add tracking&rdquo; on an order. Standing shows exactly what it will send, gives you 2
            minutes to cancel, then makes one call to PayPal and keeps PayPal&apos;s reply.
          </li>
          <li>
            <strong>Build your case.</strong> Open Packs and build an explanation pack: a letter, your sales curve and numbered evidence, as a PDF. Every
            number is written by code, not the AI.
          </li>
          <li>
            <strong>Ask Standing.</strong> Ask about your account, like &ldquo;Do I have any open alerts?&rdquo; It answers from your own records only.
          </li>
        </ol>
      </section>

      <section aria-labelledby="pages" className="guide-sec">
        <h2 id="pages">Every page</h2>
        <ul>
          <li>
            <strong>Dashboard:</strong> open alerts, where you stand, your launch plan and your case.
          </li>
          <li>
            <strong>Orders:</strong> every PayPal payment in one table; filter by missing tracking or Seller Protection, export CSV.
          </li>
          <li>
            <strong>Evidence:</strong> add things PayPal can&apos;t see, like a supplier invoice or the post that sent buyers to you.
          </li>
          <li>
            <strong>Packs:</strong> your explanation packs, ready before PayPal asks.
          </li>
          <li>
            <strong>Launch plan:</strong> tell Standing about an expected sales spike so it doesn&apos;t raise a false alarm. Each product in the plan is
            checked against PayPal&apos;s Acceptable Use Policy.
          </li>
          <li>
            <strong>Disputes:</strong> a response drafted from that payment&apos;s evidence, for you to check and send in PayPal&apos;s Resolution Center.
          </li>
          <li>
            <strong>Money on hold:</strong> if PayPal is already holding funds, a checklist of what&apos;s missing, what to fix first and what never to
            do.
          </li>
          <li>
            <strong>Ask Standing:</strong> questions about your account, answered from your records.
          </li>
          <li>
            <strong>Checklist and Catalogue:</strong> your setup steps, and each product marked physical or digital, so Standing checks tracking and
            Completed status on the right orders.
          </li>
        </ul>
      </section>

      <section aria-labelledby="demo" className="guide-sec">
        <h2 id="demo">The demo workspace</h2>
        <p>
          Your demo is a copy of a real PayPal sandbox shop, with order IDs and dates shifted so it looks recent. Everything works, but sends to PayPal
          are simulated (you&apos;ll see <code>SIMULATED-DEMO</code> instead of a PayPal ID). You have 25 questions to Ask Standing and 6 AI builds, so
          the demo stays free for everyone. It&apos;s deleted after 48 hours.
        </p>
      </section>

      <section aria-labelledby="faq" className="guide-sec">
        <h2 id="faq">FAQ</h2>
        <dl className="guide-faq">
          {FAQ.map(({ q, a }) => (
            <div key={q}>
              <dt>{q}</dt>
              <dd>{a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </DocPage>
  );
}
