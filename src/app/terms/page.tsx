import type { Metadata } from "next";
import { DocPage } from "@/components/site/DocPage";
import { REPO } from "@/lib/site/facts";

export const metadata: Metadata = { title: "Terms · Standing", description: "Standing is a hackathon demo on PayPal's sandbox, provided as is." };

export default function TermsPage() {
  return (
    <DocPage title="Terms" lead="Standing is a hackathon demo, provided as is.">
      <ul>
        <li>Use it with PayPal sandbox (test) accounts only. It can&apos;t touch live money.</li>
        <li>It isn&apos;t financial or legal advice, and it can&apos;t tell you what PayPal will decide. PayPal decides.</li>
        <li>It may be slow, wrong or offline. The AI parts in particular can make mistakes; results are published, misses included.</li>
        <li>
          The code is open source under the <a href={`${REPO}/blob/main/LICENSE`}>MIT licence</a>.
        </li>
        <li>Not affiliated with PayPal. PayPal is a trademark of its owner.</li>
      </ul>
    </DocPage>
  );
}
