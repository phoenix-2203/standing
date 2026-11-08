import type { Metadata } from "next";
import { DocPage } from "@/components/site/DocPage";
import { REPO } from "@/lib/site/facts";

export const metadata: Metadata = {
  title: "Trust",
  description: "What Standing reads from PayPal, what it stores, what it never does, which AI it uses and what that AI can't do.",
};

export default function TrustPage() {
  return (
    <DocPage title="Trust" lead="What Standing does with your PayPal account, plainly. No certifications are claimed: this is a hackathon project on PayPal's sandbox.">
      <section aria-labelledby="t-read">
        <h2 id="t-read">What it reads from PayPal</h2>
        <ul>
          <li>
            <strong>Log in with PayPal</strong> (<code>openid email paypalattributes</code> scopes): your PayPal payer ID and whether PayPal reports the
            account as verified, via <code>/v1/identity/openidconnect/userinfo</code>. The login token is used for that one call and never stored.
          </li>
          <li>
            <strong>Transaction Search</strong> (<code>/v1/reporting/transactions</code>): payments received, with their items, for the last 90 days.
          </li>
          <li>
            <strong>Disputes</strong> (<code>/v1/customer/disputes</code>), read only.
          </li>
          <li>
            <strong>Tracking</strong> (<code>/v1/shipping/trackers</code>) and <strong>Orders</strong> (<code>/v2/checkout/orders</code>): to read
            back tracking and order status.
          </li>
          <li>
            <strong>Webhooks</strong>: each one is checked with PayPal&apos;s <code>/v1/notifications/verify-webhook-signature</code> and stored once.
          </li>
        </ul>
      </section>

      <section aria-labelledby="t-write">
        <h2 id="t-write">What it can send to PayPal</h2>
        <p>
          Only order details: tracking numbers, and marking a digital order Completed. Each one is shown to you first, waits 2 minutes so you can
          cancel, is sent once with a stable request ID, and PayPal&apos;s answer is kept. It never moves money, refunds or creates payments for you.
        </p>
      </section>

      <section aria-labelledby="t-never">
        <h2 id="t-never">What it never does</h2>
        <ul>
          <li>Touch live money. Every PayPal address in the code is the sandbox, and the code refuses any other.</li>
          <li>Send anything to PayPal without the preview and the cancel window.</li>
          <li>Tell you what PayPal will decide. Standing&apos;s thresholds are its own, not PayPal&apos;s.</li>
          <li>Help you get around PayPal&apos;s checks: splitting payments, extra accounts or mislabelling products. It says no and explains why.</li>
        </ul>
      </section>

      <section aria-labelledby="t-store">
        <h2 id="t-store">What it stores, and for how long</h2>
        <p>
          In its own database: the PayPal records above (payments and their items, disputes, tracking), the alerts it raised, packs you built, evidence
          you added, launch plans, and your payer ID with its verification status. Your login is a signed cookie holding only an internal seller ID,
          valid for 8 hours. There is no automatic deletion yet: data stays until the demo is taken down. Ask to have yours removed any time (below).
        </p>
      </section>

      <section aria-labelledby="t-ai">
        <h2 id="t-ai">Which AI it uses, and what that AI receives</h2>
        <p>
          Groq (<code>openai/gpt-oss-120b</code>) and Google Gemini, on their free tiers. They receive figures and sentences Standing&apos;s code has
          already worked out, short summaries of your evidence, product names and your question. Never your PayPal login, tokens or email.
        </p>
      </section>

      <section aria-labelledby="t-limits">
        <h2 id="t-limits">What the AI can&apos;t do</h2>
        <ul>
          <li>Write a number. Any digit in its text is rejected; every figure is written by code.</li>
          <li>Call PayPal. It has no way to.</li>
          <li>Cite something that isn&apos;t there. A validator blocks a pack whose citations don&apos;t match real evidence.</li>
          <li>Take instructions from your data. Product text, invoices and questions are passed to it as data only.</li>
        </ul>
        <p>
          It still makes mistakes: on a held-out test it marked one restricted product as allowed. <a href={`${REPO}/blob/main/TESTS.md`}>Every result is published</a>.
        </p>
      </section>

      <section aria-labelledby="t-report">
        <h2 id="t-report">Report a problem</h2>
        <p>
          Open an issue on <a href={`${REPO}/issues`}>GitHub</a>. For anything security-related, say so in the title and leave out the details; we&apos;ll
          follow up privately.
        </p>
      </section>
    </DocPage>
  );
}
