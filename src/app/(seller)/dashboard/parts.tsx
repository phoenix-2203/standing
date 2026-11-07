"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { DashboardData } from "@/lib/ui/data";
import { api, day, time, usd } from "@/lib/ui/client";
import { ApprovalDraftButton } from "./approval-draft";

// Every figure shown here was computed by Standing's code on the server; these components only format it.

export function VerificationBadge({ item }: { item: DashboardData["verification"] }) {
  const tone = item.state === "done" ? "ok" : item.state === "unknown" ? "info" : "warn";
  return (
    <Link href="/checklist" className={`badge ${tone}`} title={item.detail}>
      {item.title}
    </Link>
  );
}

const LINK_TEXT = (link: string) => (link.endsWith("/pdf") ? "Open the pack" : link === "/checklist" ? "See what to do" : "Open");

/** What needs the seller, grouped by urgency like a task list: warnings first, then calm notes. One line each. */
export function NeedsYouCard({ alerts }: { alerts: DashboardData["alerts"] }) {
  const groups = [
    { title: "Needs you", items: alerts.filter((a) => a.severity === "warning"), tone: "warn" },
    { title: "Notes", items: alerts.filter((a) => a.severity !== "warning"), tone: "info" },
  ].filter((g) => g.items.length);
  return (
    <section className="card" aria-labelledby="needs-h">
      <h2 id="needs-h">What needs you</h2>
      {groups.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Nothing needs your attention right now. Standing checks again every 15 minutes.
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.title} className="task-group">
            <h3 className="task-group-title">
              {g.title} <span className="mono">{g.items.length}</span>
            </h3>
            <ul className="tasks">
              {g.items.map((a) => (
                <li key={a.id} className={`task ${g.tone}`}>
                  <div>
                    <strong>{a.title}</strong>
                    <p className="muted small">{a.message}</p>
                  </div>
                  {a.link ? (
                    <a className="button secondary task-action" href={a.link}>
                      {LINK_TEXT(a.link)}
                    </a>
                  ) : (
                    g.tone === "warn" && (
                      <a className="button secondary task-action" href="/orders">
                        Review orders
                      </a>
                    )
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

const STATE: Record<DashboardData["standing"][number]["state"], { label: string; tone: string }> = {
  needs_you: { label: "Needs you", tone: "warn" },
  expected: { label: "Expected, pack ready", tone: "ok" },
  applies: { label: "Applies to you", tone: "info" },
  clear: { label: "Clear", tone: "ok" },
  no_history: { label: "Not enough history", tone: "" },
  no_data: { label: "No data yet", tone: "" },
  context: { label: "For context", tone: "" },
};

/** "Where you stand": each reason PayPal publishes, the seller's figure now, and Standing's reading. */
export function StandingCard({ rows }: { rows: DashboardData["standing"] }) {
  const needing = rows.filter((r) => r.state === "needs_you").length;
  return (
    <section className="card" aria-labelledby="standing-h">
      <div className="card-head">
        <h2 id="standing-h">Where you stand</h2>
        <span className="muted small">
          {needing === 0 ? "No reason needs you today" : `${needing} of ${rows.length} need you today`}
        </span>
      </div>
      <div className="standing-table" role="table" aria-label="PayPal's reasons and your figures">
        <div className="standing-row head" role="row">
          <span role="columnheader">Reason</span>
          <span role="columnheader">You now</span>
          <span role="columnheader">Standing&apos;s reading</span>
        </div>
        {rows.map((r) => (
          <div key={r.key} className="standing-row" role="row">
            <span role="cell">
              <strong>{r.reason}</strong>
              <span className="muted small block">{r.source}</span>
            </span>
            <span role="cell">
              <span className="figure-text">{r.figure}</span>
              <span className="muted small block">{r.threshold}</span>
            </span>
            <span role="cell">
              {STATE[r.state].tone ? <span className={`badge ${STATE[r.state].tone}`}>{STATE[r.state].label}</span> : <span className="muted small">{STATE[r.state].label}</span>}
            </span>
          </div>
        ))}
      </div>
      <p className="muted small" style={{ margin: "0.75rem 0 0" }}>
        Standing&apos;s reading of PayPal&apos;s published reasons, with Standing&apos;s own thresholds. It isn&apos;t PayPal&apos;s decision and can&apos;t
        say what PayPal will do.
      </p>
    </section>
  );
}

type Fix = { requestId: string; status: string; summary?: string | null; undoUntil: string | null; outcome?: string; error?: string };

/** Digital orders: one click starts the queued fix; the seller can cancel until the window ends. */
export function DigitalCard({ gaps, onChange }: { gaps: DashboardData["digital"]; onChange: () => void }) {
  return (
    <section className="card" aria-labelledby="digital-h">
      <h2 id="digital-h">Digital orders to mark Completed</h2>
      {gaps.length === 0 ? (
        <p className="muted">No digital or service orders are waiting to be marked Completed.</p>
      ) : (
        <div className="rows">
          {gaps.map((g) => (
            <DigitalRow key={g.transactionId} gap={g} onChange={onChange} />
          ))}
        </div>
      )}
      <p className="muted small" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
        The fix marks the order Completed in PayPal. You can cancel it for 2 minutes before it is sent.
      </p>
    </section>
  );
}

/** A fix in the queue: counts down its cancel window, then asks the server to send (the queue refuses anything earlier). */
function useQueuedFix(initial: Fix | null, onChange: () => void) {
  const [fix, setFix] = useState<Fix | null>(initial);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const due = fix?.undoUntil ? Date.parse(fix.undoUntil) : null;
  const waiting = fix?.status === "scheduled" && due !== null && due > now;

  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [waiting]);

  useEffect(() => {
    if (fix?.status !== "scheduled" || due === null || due > now || busy) return;
    let live = true;
    void (async () => {
      setBusy(true);
      const res = await api<{ outcome: string; status: string }>(`/api/actions/${fix.requestId}/send`, { method: "POST" });
      if (!live) return;
      setBusy(false);
      setFix((f) => (f ? { ...f, status: res.data?.status ?? f.status, outcome: res.data?.outcome } : f));
      if (res.data?.outcome === "sent") onChange();
    })();
    return () => {
      live = false;
    };
  }, [fix, due, now, busy, onChange]);

  async function cancel() {
    if (!fix) return;
    setBusy(true);
    const res = await api<{ cancelled: boolean; status: string }>(`/api/actions/${fix.requestId}/cancel`, { method: "POST" });
    setBusy(false);
    setFix({ ...fix, status: res.data?.status ?? fix.status });
  }

  const secondsLeft = due ? Math.max(0, Math.ceil((due - now) / 1000)) : 0;
  return { fix, setFix, setNow, busy, setBusy, waiting, secondsLeft, cancel };
}

/** Where a started fix stands: the cancel button during the window, then PayPal's outcome. */
function FixState({ q }: { q: ReturnType<typeof useQueuedFix> }) {
  const { fix, waiting, secondsLeft, busy, cancel } = q;
  if (!fix) return null;
  if (waiting) {
    return (
      <button className="secondary" onClick={cancel} disabled={busy}>
        Cancel ({Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")})
      </button>
    );
  }
  if (fix.status === "sent" || fix.outcome === "sent") return <span className="badge ok">Sent to PayPal</span>;
  if (fix.status === "failed") return <span className="badge bad">PayPal refused it</span>;
  if (fix.status === "unknown") return <span className="badge warn">No answer yet: will retry</span>;
  return <span className="badge info">Sending…</span>;
}

const CARRIERS = [
  ["USPS", "USPS"],
  ["UPS", "UPS"],
  ["FEDEX", "FedEx"],
  ["DHL", "DHL"],
  ["OTHER", "Other…"],
] as const;

/** Physical orders with no tracking: the seller types the number; nothing here ever makes one up. */
export function TrackingCard({ gaps, onChange }: { gaps: DashboardData["tracking"]; onChange: () => void }) {
  return (
    <section className="card" id="tracking" aria-labelledby="tracking-h">
      <h2 id="tracking-h">Physical orders without tracking</h2>
      {gaps.length === 0 ? (
        <p className="muted">No physical orders are waiting for tracking. Orders count once their products are in your catalogue.</p>
      ) : (
        <div className="rows">
          {gaps.map((g) => (
            <TrackingRow key={g.transactionId} gap={g} onChange={onChange} />
          ))}
        </div>
      )}
      <p className="muted small" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
        Goes to PayPal with the number you type. You can cancel it for 2 minutes before it is sent. The buyer is not emailed.
      </p>
    </section>
  );
}

function TrackingRow({ gap, onChange }: { gap: DashboardData["tracking"][number]; onChange: () => void }) {
  const q = useQueuedFix(gap.fix ? { ...gap.fix } : null, onChange);
  const { fix, setFix, setNow, busy, setBusy, waiting } = q;
  const [number, setNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const open = !fix || fix.status === "cancelled" || fix.status === "failed";

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api<Fix & { error?: string }>(`/api/tracking/orders/${gap.transactionId}`, {
      method: "POST",
      body: JSON.stringify({ trackingNumber: number, carrier, carrierNameOther: carrierName }),
    });
    setBusy(false);
    setNow(Date.now());
    if (res.status !== 200 || !res.data) return setError(res.data?.error ?? "The tracking number couldn't be queued.");
    setFix(res.data);
  }

  return (
    <div className="stack" style={{ paddingBlock: "0.75rem", gap: "0.5rem" }}>
      <div className="row" style={{ border: 0, padding: 0 }}>
        <div>
          <div className="mono">{gap.transactionId}</div>
          <div className="muted small">
            {usd(gap.cents)} · {day(gap.at)}
            {gap.overdue && " · over 48 hours old"}
          </div>
        </div>
        {!open && <FixState q={q} />}
      </div>
      {fix?.summary && waiting && <div className="small">{fix.summary}</div>}
      {fix?.status === "failed" && <div className="small error">PayPal refused that number. Check it and try again.</div>}
      {open && (
        <form className="form" onSubmit={start}>
          <div className="form-row">
            <label>
              Tracking number
              <input required maxLength={64} pattern="[A-Za-z0-9\\-]+" title="Letters, digits and dashes only" value={number} onChange={(e) => setNumber(e.target.value)} />
            </label>
            <label>
              Carrier
              <select required value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                <option value="" disabled>
                  Choose…
                </option>
                {CARRIERS.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {carrier === "OTHER" && (
              <label>
                Carrier name
                <input required maxLength={60} value={carrierName} onChange={(e) => setCarrierName(e.target.value)} />
              </label>
            )}
          </div>
          <div>
            <button disabled={busy}>{busy ? "Saving…" : fix?.status === "cancelled" ? "Add tracking again" : "Add tracking"}</button>
          </div>
          {error && (
            <p className="error small" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

function DigitalRow({ gap, onChange }: { gap: DashboardData["digital"][number]; onChange: () => void }) {
  const q = useQueuedFix(gap.fix ? { ...gap.fix } : null, onChange);
  const { fix, setFix, setNow, busy, setBusy, waiting } = q;

  async function start() {
    setBusy(true);
    const res = await api<Fix & { error?: string }>(`/api/digital/orders/${gap.transactionId}/complete`, { method: "POST" });
    setBusy(false);
    setNow(Date.now());
    if (res.status !== 200 || !res.data) return setFix({ requestId: "", status: "error", undoUntil: null, error: res.data?.error ?? "Couldn't start the fix." });
    setFix(res.data);
  }

  return (
    <div className="row">
      <div>
        <div className="mono">{gap.transactionId}</div>
        <div className="muted small">
          {usd(gap.cents)} · {day(gap.at)} · {gap.kind}
          {gap.proofs.length > 0 && ` · ${gap.proofs.length} delivery record${gap.proofs.length === 1 ? "" : "s"}`}
        </div>
        {fix?.summary && waiting && <div className="small">{fix.summary}</div>}
        {fix?.error && <div className="small error">{fix.error}</div>}
      </div>
      <div>
        {!fix || fix.status === "cancelled" || fix.status === "error" ? (
          <button onClick={start} disabled={busy}>
            {fix?.status === "cancelled" ? "Mark Completed again" : "Mark Completed"}
          </button>
        ) : (
          <FixState q={q} />
        )}
      </div>
    </div>
  );
}

export function PackCard({ latest }: { latest: DashboardData["latestPack"] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function build() {
    setBusy(true);
    setError(null);
    const res = await api<{ id?: string; error?: string }>("/api/packs", { method: "POST" });
    setBusy(false);
    if (res.status === 201 && res.data?.id) router.push(`/packs/${res.data.id}`);
    else setError(res.data?.error ?? "The pack couldn't be built.");
  }
  return (
    <section className="card" aria-labelledby="pack-h">
      <h2 id="pack-h">Explanation pack</h2>
      <p className="muted">Your case, built from your PayPal records before anyone asks: a sales curve and a letter in which every figure comes from your evidence.</p>
      {latest && (
        <p className="small">
          Latest: <Link href={`/packs/${latest.id}`}>{time(latest.createdAt)}</Link>{" "}
          <span className={`badge ${latest.status === "ready" ? "ok" : "bad"}`}>{latest.status}</span>
        </p>
      )}
      <button onClick={build} disabled={busy}>
        {busy ? "Building… (up to a minute)" : "Build a new pack"}
      </button>
      {error && <p className="error small">{error}</p>}
    </section>
  );
}

type AskResponse = { decision: "answer" | "refuse" | "no_data"; text: string; sentences: { kind: "fact" | "bridge"; text: string; citations: string[] }[] };

export function AskCard() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    const res = await api<AskResponse>("/api/ask", { method: "POST", body: JSON.stringify({ question }) });
    setBusy(false);
    if (res.status !== 200 || !res.data) return setError("Standing couldn't answer right now. Please try again.");
    setAnswer(res.data);
  }
  return (
    <section className="card" aria-labelledby="ask-h">
      <h2 id="ask-h">Ask Standing</h2>
      <form className="form" onSubmit={ask}>
        <label>
          Your question
          <input value={question} maxLength={500} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. What is my spike ratio?" />
        </label>
        <div>
          <button disabled={busy || !question.trim()}>{busy ? "Thinking…" : "Ask"}</button>
        </div>
      </form>
      {error && <p className="error small">{error}</p>}
      {answer && (
        <div className="answer">
          {answer.decision === "refuse" ? (
            <div className="alert">
              <h3>Standing won&apos;t help with that</h3>
              <p>{answer.text}</p>
            </div>
          ) : answer.decision === "no_data" ? (
            <p className="muted">{answer.text}</p>
          ) : (
            <p>
              {answer.sentences.map((s, i) => (
                <span key={i}>
                  {s.text}
                  {s.citations.length > 0 && <span className="cite">[{s.citations.join(", ")}]</span>}{" "}
                </span>
              ))}
            </p>
          )}
          <p className="muted small" style={{ marginBottom: 0 }}>
            Answers come only from your Standing data: metrics, alerts, PayPal policy clauses and evidence.
          </p>
        </div>
      )}
    </section>
  );
}

type PlanResult = { error?: string; policy?: { name: string; verdict: string; clauseId: string | null; quote: string | null; reason: string }[]; packId?: string | null; packStatus?: "ready" | "blocked" | "none" };

export function LaunchCard({ plans, onChange }: { plans: DashboardData["launchPlans"]; onChange: () => void }) {
  const [date, setDate] = useState("");
  const [multiple, setMultiple] = useState("3");
  const [products, setProducts] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PlanResult | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const res = await api<PlanResult>("/api/launch-plans", {
      method: "POST",
      body: JSON.stringify({
        launchDate: date,
        expectedMultiple: Number(multiple),
        products: products
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .map((name) => ({ name })),
      }),
    });
    setBusy(false);
    setResult(res.status === 201 ? res.data : { error: res.data?.error ?? "The plan couldn't be saved." });
    if (res.status === 201) onChange();
  }
  const verdictTone = (v: string) => (v === "allowed" ? "ok" : v === "prohibited" ? "bad" : "warn");
  const verdictLabel: Record<string, string> = { allowed: "allowed", preapproval: "needs PayPal pre-approval", prohibited: "prohibited", unclear: "unclear: check it" };
  return (
    <section className="card" aria-labelledby="launch-h">
      <h2 id="launch-h">Launch plan</h2>
      {plans.length > 0 && (
        <div className="rows" style={{ marginBottom: "0.75rem" }}>
          {plans.map((p) => (
            <div key={p.id} className="row small">
              <span>
                {day(p.launchDate)} · up to {p.expectedMultiple}× · {p.policy.length} product{p.policy.length === 1 ? "" : "s"}
              </span>
              <PlanPackBadge status={p.packStatus} packId={p.packId} />
            </div>
          ))}
        </div>
      )}
      <form className="form" onSubmit={save}>
        <div className="form-row">
          <label>
            Launch date
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Expected sales (× a normal day)
            <input type="number" min="1.5" max="1000" step="0.5" required value={multiple} onChange={(e) => setMultiple(e.target.value)} />
          </label>
        </div>
        <label>
          Launch products, one per line
          <textarea rows={3} required value={products} onChange={(e) => setProducts(e.target.value)} placeholder="Lavender soy candle" />
        </label>
        <div>
          <button disabled={busy}>{busy ? "Checking products…" : "Save plan"}</button>
        </div>
      </form>
      {result?.error && <p className="error small">{result.error}</p>}
      {result?.policy && (
        <div className="answer rows">
          {result.policy.map((p) => (
            <div key={p.name} className="row small">
              <span>{p.name}</span>
              <span className={`badge ${verdictTone(p.verdict)}`} title={p.quote ? `${p.clauseId}: "${p.quote}"` : p.reason}>
                {verdictLabel[p.verdict] ?? p.verdict}
                {p.clauseId ? ` · ${p.clauseId}` : ""}
              </span>
              {p.verdict === "preapproval" && p.clauseId && <ApprovalDraftButton name={p.name} clauseId={p.clauseId} />}
            </div>
          ))}
          <p className="muted small" style={{ marginBottom: 0 }}>
            {result.packStatus === "ready" ? (
              "Your explanation pack is pre-built for this launch."
            ) : result.packStatus === "blocked" && result.packId ? (
              <>
                Standing built a pack, but its checks stopped the letter, so it isn&apos;t ready. <Link href={`/packs/${result.packId}`}>See why</Link>, or build a new one from Packs. It is rebuilt when the launch window opens.
              </>
            ) : (
              "The pack will be built when the launch window opens."
            )}
          </p>
        </div>
      )}
    </section>
  );
}

/** A launch plan's pack as stored: a blocked pack is never shown as built. */
function PlanPackBadge({ status, packId }: { status: "ready" | "blocked" | "none"; packId: string | null }) {
  if (status === "ready") return <span className="badge ok">pack ready</span>;
  if (status === "blocked" && packId)
    return (
      <Link className="badge bad" href={`/packs/${packId}`}>
        pack blocked: see why
      </Link>
    );
  return <span className="badge warn">pack not built</span>;
}
