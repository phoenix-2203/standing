"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api, day, time } from "@/lib/ui/client";

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
    <Suspense fallback={<p className="muted">Loading…</p>}>
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
      <section className="card">
        <h1>Log in to see this pack</h1>
        <a className="button" href="/api/auth/paypal/start">
          Log in with PayPal
        </a>
      </section>
    );
  }
  if (state === "missing") return <p className="muted">This pack doesn&apos;t exist or isn&apos;t yours.</p>;
  if (!pack) return <p className="muted">Loading…</p>;

  // Number each cited evidence item in order of first citation, as the PDF does.
  const order: string[] = [];
  for (const p of pack.letter?.paragraphs ?? []) for (const s of p.sentences) for (const c of s.citations) if (!order.includes(c)) order.push(c);
  const byId = new Map(pack.evidence.map((e) => [e.id, e]));
  const ready = pack.status === "ready";

  return (
    <>
      <div className="page-head">
        <div>
          <p className="small">
            <Link href="/packs">← All packs</Link>
          </p>
          <h1>Explanation pack</h1>
          <p className="muted small">
            Built {time(pack.createdAt)} · covers {day(pack.periodFrom)} to {day(pack.periodTo)}
          </p>
        </div>
        {ready ? (
          <a className="button" href={`/api/packs/${pack.id}/pdf`}>
            Download PDF
          </a>
        ) : (
          <span className="badge bad">Blocked: can&apos;t be exported</span>
        )}
      </div>

      <div className="stack">
        {!ready && (
          <section className="alert">
            <h3>This pack was blocked by the citation check</h3>
            <p>Standing only lets a letter out if every figure comes from your evidence. Problems found after {pack.attempts} attempt(s):</p>
            <ul>
              {pack.problems.map((p, i) => (
                <li key={i}>{p.problem}</li>
              ))}
            </ul>
          </section>
        )}

        {pack.letter && (
          <section className="card" data-shot="prove">
            <h2>Cover letter</h2>
            <p>To PayPal&apos;s account review team,</p>
            {pack.letter.paragraphs.map((p, i) => (
              <p key={i}>
                {p.sentences.map((s, j) => (
                  <span key={j}>
                    {s.text}
                    {s.citations.length > 0 && <sup className="cite">[{s.citations.map((c) => order.indexOf(c) + 1).join(", ")}]</sup>}{" "}
                  </span>
                ))}
              </p>
            ))}
            <p className="muted small" style={{ marginBottom: 0 }}>
              Every numbered statement is generated from the evidence listed below. Connecting sentences contain no figures.
            </p>
          </section>
        )}

        <section className="card">
          <h2>Sales curve</h2>
          <SalesCurve curve={pack.salesCurve} />
        </section>

        <section className="card">
          <h2>Evidence</h2>
          {order.length === 0 ? (
            <p className="muted">No evidence cited.</p>
          ) : (
            <ol className="rows" style={{ paddingLeft: 0, listStyle: "none", margin: 0 }}>
              {order.map((id, i) => {
                const e = byId.get(id);
                return (
                  <li key={id} className="row" style={{ alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="mono">
                        [{i + 1}] {id}
                      </div>
                      <div className="small">{e?.summary ?? "Missing from the pack's evidence snapshot"}</div>
                    </div>
                    {e?.simulated && <span className="badge warn">Simulated</span>}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}

function SalesCurve({ curve }: { curve: PackView["salesCurve"] }) {
  const max = Math.max(1, ...curve.map((d) => d.cents));
  const total = curve.reduce((a, d) => a + d.cents, 0);
  const orders = curve.reduce((a, d) => a + d.orders, 0);
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${curve.length * 10} 100`} preserveAspectRatio="none" style={{ width: "100%", height: 140, display: "block" }} role="img" aria-label="Daily PayPal payments received">
        <line x1="0" y1="100" x2={curve.length * 10} y2="100" stroke="var(--line)" strokeWidth="1" />
        {curve.map((d, i) => {
          const h = (d.cents / max) * 96;
          return h > 0 ? (
            <rect key={d.day} x={i * 10 + 1.5} y={100 - h} width="7" height={h} fill="var(--accent)">
              <title>{`${d.day}: ${d.orders} payments, USD ${(d.cents / 100).toFixed(2)}`}</title>
            </rect>
          ) : null;
        })}
      </svg>
      <figcaption className="muted small" style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.4rem" }}>
        <span>{curve[0]?.day}</span>
        <span>
          {orders} payments · USD {(total / 100).toFixed(2)} in all
        </span>
        <span>{curve.at(-1)?.day}</span>
      </figcaption>
    </figure>
  );
}
