import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "@/components/site/DocPage";

export const metadata: Metadata = { title: "Privacy · Standing", description: "Standing is a hackathon demo on PayPal's sandbox. What that means for your data." };

export default function PrivacyPage() {
  return (
    <DocPage title="Privacy" lead="Standing is a hackathon demo, not a company. This is a short notice, not a legal policy.">
      <ul>
        <li>It works only with PayPal sandbox (test) accounts. Please don&apos;t connect anything real.</li>
        <li>It keeps the sandbox records it reads from PayPal and what you add, as listed on the <Link href="/trust">Trust page</Link>.</li>
        <li>No analytics, no advertising, no tracking cookies. The only cookies are your login (valid for 8 hours) and a short one used while you log in (10 minutes).</li>
        <li>Parts of your data go to an AI provider only as described on the <Link href="/trust">Trust page</Link>.</li>
        <li>Nothing is sold or shared with anyone else. Ask on GitHub to have your data removed.</li>
      </ul>
    </DocPage>
  );
}
