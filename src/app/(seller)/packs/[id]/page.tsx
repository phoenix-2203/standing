"use client";

import { ArrowLeft, Download, FileX2, LogIn } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BuildPackButton } from "@/components/app/BuildPackButton";
import { Badge, ButtonAnchor, ButtonLink, Callout, EmptyState, SimulatedBadge, Skeleton, SkeletonText } from "@/components/ui";
import { api } from "@/lib/ui/client";
import { dateOnly, dateTime, moneyCents } from "@/lib/ui/format";

type PackView = {
  id: string;
  status: "ready" | "blocked" | "draft";
  createdAt: string;
  periodFrom: string;
  periodTo: string;
  salesCurve: { day: string; cents: number; orders: number }[];
  letter: { paragraphs: { sentences: { kind: "fact" | "bridge"; text: string; citations: string[] }[] }[] } | null;
  evidence: { id: string; kind: string; summary: string; simulated: boolean }[];
  problems: { paragraph: number; item: number; text: string; problem: string }[];
  attempts: number;
};

// The pack ID comes from the URL, so that part renders inside Suspense (Next requires it).
export default function PackPage() {
  return (
    <Suspense fallback={<PackSkeleton />}>
      <PackDetail />
    </Suspense>
  );
}

function PackDetail() {
  const { id } = useParams<{ id: string }>();
  const [pack, setPack] = useState<PackView | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing" | "signed_out">("loading");

  useEffect(() => {
    let live = true;
    void api<PackView>(`/api/packs/${id}`).then((res) => {
      if (!live) return;
      if (res.status === 401) return setState("signed_out");
      if (res.status !== 200 || !res.data) return setState("missing");
      setPack(res.data);
      setState("ok");
    });
    return () => {
      live = false;
    };
  }, [id]);

  if (state === "signed_out") {
    return (
      <EmptyState
        icon={LogIn}
        title="Log in to see this pack"
        action={
          <ButtonLink href="/api/auth/paypal/start" prefetch={false}>
            Log in with PayPal
          </ButtonLink>
        }
      >
        Packs are built from your own PayPal sandbox records.
      </EmptyState>
    );
  }
  if (state === "missing") {
    return (
      <EmptyState icon={FileX2} title="This pack isn't here" action={<ButtonLink href="/packs" variant="secondary">All packs</ButtonLink>}>
        It doesn&apos;t exist or isn&apos;t yours.
      </EmptyState>
    );
  }
  if (!pack) return <PackSkeleton />;

  // Number each cited evidence item in order of first citation, as the PDF does.
  const order: string[] = [];
  for (const p of pack.letter?.paragraphs ?? []) for (const s of p.sentences) for (const c of s.citations) if (!order.includes(c)) order.push(c);
  const byId = new Map(pack.evidence.map((e) => [e.id, e]));
  const ready = pack.status === "ready";

  return (
    <div className="doc-page">
      <div className="doc-bar">
        <Link href="/packs" className="doc-back">
          <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" /> All packs
        </Link>
        <Badge tone={ready ? "ok" : "bad"}>{ready ? "Ready" : "Blocked"}</Badge>
        <span className="doc-bar-action">
          {ready ? (
            <ButtonAnchor href={`/api/packs/${pack.id}/pdf`} icon={<Download size={16} strokeWidth={1.75} aria-hidden="true" />}>
              Download PDF
            </ButtonAnchor>
          ) : (
            <BuildPackButton label="Try again" />
          )}
        </span>
      </div>

      {!ready && (
        <Callout tone="bad" title="This pack was held back, so nothing can be exported">
          <p>
            Standing only lets a letter out when every figure in it comes from your records. This time the AI&apos;s draft didn&apos;t pass that check
            {pack.attempts > 1 ? ` after ${pack.attempts} attempts` : ""}, so Standing kept it back instead of sending you a letter it can&apos;t
            stand behind. Your records are fine; trying again usually works. A launch-plan pack is rebuilt from the launch plan.
          </p>
          {pack.problems.length > 0 && (
            <details className="doc-problems">
              <summary>What the check found</summary>
              <ul>
                {pack.problems.map((p, i) => (
                  <li key={i}>{p.problem}</li>
                ))}
              </ul>
            </details>
          )}
        </Callout>
      )}

      <article className="paper" aria-labelledby="doc-title">
        <header className="paper-head">
          <p className="ui-eyebrow">Explanation pack</p>
          <h1 id="doc-title" className="paper-title">
            Your sales, explained from your PayPal records
          </h1>
          <p className="paper-meta">
            Built {dateTime(pack.createdAt)} · covers {dateOnly(pack.periodFrom)} to {dateOnly(pack.periodTo)} · PayPal sandbox
          </p>
        </header>

        {pack.letter && (
          <section className="paper-letter" data-shot="prove" aria-label="Cover letter">
            <p>To PayPal&apos;s account review team,</p>
            {pack.letter.paragraphs.map((p, i) => (
              <p key={i}>
                {p.sentences.map((s, j) => (
                  <span key={j}>
                    {s.text}
                    {s.citations.map((c) => {
                      const n = order.indexOf(c) + 1;
                      return (
                        <a key={c} href={`#ev-${n}`} className="cite-chip" aria-label={`Evidence ${n}`}>
                          {n}
                        </a>
                      );
                    })}{" "}
                  </span>
                ))}
              </p>
            ))}
            <p className="paper-note">Every numbered statement is written by Standing&apos;s code from the evidence below. Connecting sentences contain no figures.</p>
          </section>
        )}

        <section className="paper-section" aria-labelledby="curve-h">
          <h2 id="curve-h">Sales curve</h2>
          <SalesCurve curve={pack.salesCurve} />
        </section>

        <section className="paper-section" aria-labelledby="ev-h">
          <h2 id="ev-h">Evidence</h2>
          {order.length === 0 ? (
            <p className="muted">No evidence cited.</p>
          ) : (
            <ol className="sources">
              {order.map((eid, i) => {
                const e = byId.get(eid);
                return (
                  <li key={eid} id={`ev-${i + 1}`} className="source" tabIndex={-1}>
                    <span className="source-num">{i + 1}</span>
                    <div className="source-body">
                      <div>{e?.summary ?? "Missing from the pack's evidence snapshot"}</div>
                      <div className="source-id mono">{eid}</div>
                    </div>
                    {e?.simulated && <SimulatedBadge />}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </article>
    </div>
  );
}

function SalesCurve({ curve }: { curve: PackView["salesCurve"] }) {
  const max = Math.max(1, ...curve.map((d) => d.cents));
  const total = curve.reduce((a, d) => a + d.cents, 0);
  const orders = curve.reduce((a, d) => a + d.orders, 0);
  return (
    <figure className="curve">
      <svg viewBox={`0 0 ${curve.length * 10} 100`} preserveAspectRatio="none" className="curve-svg" role="img" aria-label="Daily PayPal payments received">
        <line x1="0" y1="100" x2={curve.length * 10} y2="100" stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {curve.map((d, i) => {
          const h = (d.cents / max) * 96;
          return h > 0 ? (
            <rect key={d.day} x={i * 10 + 1.5} y={100 - h} width="7" height={h} rx="1" fill="var(--accent)">
              <title>{`${d.day}: ${d.orders} payments, ${moneyCents(d.cents, "USD")}`}</title>
            </rect>
          ) : null;
        })}
      </svg>
      <figcaption className="curve-cap">
        <span>{curve[0]?.day}</span>
        <span>
          {orders} payments · {moneyCents(total, "USD")} in all
        </span>
        <span>{curve.at(-1)?.day}</span>
      </figcaption>
    </figure>
  );
}

function PackSkeleton() {
  return (
    <div className="doc-page" aria-busy="true" aria-label="Loading the pack">
      <div className="doc-bar">
        <Skeleton height={20} width={90} />
        <span className="doc-bar-action">
          <Skeleton height={40} width={150} radius={6} />
        </span>
      </div>
      <div className="paper">
        <Skeleton height={32} width="70%" />
        <div style={{ height: 24 }} />
        <SkeletonText lines={8} />
      </div>
    </div>
  );
}
