"use client";

import { CircleCheck, Download, FileText, FolderOpen, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, ButtonAnchor, ButtonLink, Card, StatTile, type Tone } from "@/components/ui";
import { api } from "@/lib/ui/client";
import type { DashboardData } from "@/lib/ui/data";
import { dateTime, ratio, relative } from "@/lib/ui/format";

// Presentation of what /api/dashboard already returns. Every figure was computed by Standing's code on the server;
// these components only choose how to show it.

const LINK_TEXT = (link: string) => (link.endsWith("/pdf") ? "Open the pack" : link === "/checklist" ? "See what to do" : "Open");

/** Signals as action cards, most severe first (the server already sorts warnings before notes). */
export function NeedsYou({ alerts }: { alerts: DashboardData["alerts"] }) {
  if (alerts.length === 0) {
    return (
      <div className="needs-empty">
        <CircleCheck size={20} strokeWidth={1.75} aria-hidden="true" />
        <div>
          <p className="needs-empty-title">Nothing needs you right now</p>
          <p className="muted">Standing checks your PayPal records again every 15 minutes.</p>
        </div>
      </div>
    );
  }
  return (
    <ul className="needs">
      {alerts.map((a) => {
        const warn = a.severity === "warning";
        const href = a.link ?? (warn ? "/orders" : null);
        return (
          <li key={a.id} className={`need ${warn ? "need-warn" : "need-info"}`}>
            <div className="need-head">
              <Badge tone={warn ? "warn" : "info"}>{warn ? "Needs you" : "Note"}</Badge>
              <span className="need-since" title={relative(a.since)}>
                since {dateTime(a.since)}
              </span>
            </div>
            <h3 className="need-title">{a.title}</h3>
            <p className="need-msg">{a.message}</p>
            {href && (
              <ButtonLink href={href} size="sm" variant={warn ? "primary" : "secondary"} prefetch={false}>
                {a.link ? LINK_TEXT(a.link) : "Review orders"}
              </ButtonLink>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const STATE: Record<DashboardData["standing"][number]["state"], { label: string; tone: Tone }> = {
  needs_you: { label: "Needs you", tone: "warn" },
  expected: { label: "Expected, pack ready", tone: "ok" },
  applies: { label: "Applies to you", tone: "info" },
  clear: { label: "Clear", tone: "ok" },
  no_history: { label: "Not enough history", tone: "neutral" },
  no_data: { label: "No data yet", tone: "neutral" },
  context: { label: "For context", tone: "neutral" },
};

/** The headline number for each reason, taken from the metrics the server computed. Formatting only. */
function headline(key: string, m: DashboardData["metrics"], threshold: number): { figure: string; label: string } {
  const pct = (r: number) => `${Math.floor(r * 100)}%`;
  switch (key) {
    case "spike":
      return m.spike.ratio === null ? { figure: "—", label: "Sales in the last 24 h" } : { figure: ratio(m.spike.ratio), label: "Sales in the last 24 h vs an average day" };
    case "price": {
      const big = m.avgTicket.largestRecent;
      if (big && big.multiple >= threshold) return { figure: ratio(big.multiple), label: "Largest recent order vs your average" };
      return m.avgTicket.ratio === null ? { figure: "—", label: "Average order, 7 days vs 28" } : { figure: ratio(m.avgTicket.ratio), label: "Average order, 7 days vs 28" };
    }
    case "item_type":
      return { figure: String(m.newProductTypes.newCategories.length), label: "New kinds of product this week" };
    case "first_time": {
      const d = Math.floor(m.history.days);
      return { figure: m.history.firstSaleAt ? `${d} ${d === 1 ? "day" : "days"}` : "—", label: "Selling for" };
    }
    case "tracking":
      return m.trackingCoverage.coverage === null ? { figure: "—", label: "Shipped orders with tracking" } : { figure: pct(m.trackingCoverage.coverage), label: "Shipped orders with tracking" };
    case "digital":
      return { figure: String(m.digitalCompletionGap.count), label: "Digital orders not marked Completed" };
    case "complaints":
      return m.disputeRate90d.rate === null ? { figure: "—", label: "Orders disputed, 90 days" } : { figure: `${(Math.floor(m.disputeRate90d.rate * 1000) / 10).toFixed(1)}%`, label: "Orders disputed, 90 days" };
    default:
      return { figure: "—", label: "" };
  }
}

/** "Where you stand": one tile per reason PayPal publishes, with the seller's figure, its meaning and the threshold. */
export function WhereYouStand({ rows, metrics, thresholds }: { rows: DashboardData["standing"]; metrics: DashboardData["metrics"]; thresholds: DashboardData["thresholds"] }) {
  const needing = rows.filter((r) => r.state === "needs_you").length;
  return (
    <section aria-labelledby="standing-h" data-shot="watch" className="dash-section">
      <div className="dash-section-head">
        <h2 id="standing-h">Where you stand</h2>
        <span className="muted small">{needing === 0 ? "No reason needs you today" : `${needing} of ${rows.length} need you today`}</span>
      </div>
      <div className="tiles">
        {rows.map((r) => {
          const h = headline(r.key, metrics, thresholds.singleOrderMultiple);
          const s = STATE[r.state];
          return (
            <StatTile
              key={r.key}
              label={r.reason}
              figure={h.figure}
              sub={
                <>
                  <span className="tile-meaning">{h.label}</span>
                  <span className="tile-detail">{r.figure}</span>
                </>
              }
              note={`${r.threshold} · ${r.source}`}
              tone={r.state === "needs_you" ? "warn" : undefined}
              badge={<Badge tone={s.tone}>{s.label}</Badge>}
            />
          );
        })}
      </div>
      <p className="muted small dash-foot">
        Standing&apos;s reading of PayPal&apos;s published reasons, with Standing&apos;s own thresholds. It isn&apos;t PayPal&apos;s decision and can&apos;t say what
        PayPal will do.
      </p>
    </section>
  );
}

/** Your case: the latest pack, how much evidence there is, and what's planned. */
export function YourCase({ latest }: { latest: DashboardData["latestPack"] }) {
  const [evidence, setEvidence] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void api<Record<string, unknown>>("/api/evidence").then((r) => {
      const list = r.data ? Object.values(r.data).find(Array.isArray) : null;
      if (live && list) setEvidence(list.length);
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <Card title="Your case" id="pack-h" description="Built from your PayPal records before anyone asks.">
      <div className="case-rows">
        <div className="case-row">
          <FileText size={18} strokeWidth={1.75} aria-hidden="true" />
          <div>
            <div className="case-label">Explanation pack</div>
            {latest ? (
              <div className="case-value">
                <Link href={`/packs/${latest.id}`}>{dateTime(latest.createdAt)}</Link> <Badge tone={latest.status === "ready" ? "ok" : "bad"}>{latest.status}</Badge>
              </div>
            ) : (
              <div className="case-value muted">None built yet</div>
            )}
          </div>
        </div>
        <div className="case-row">
          <FolderOpen size={18} strokeWidth={1.75} aria-hidden="true" />
          <div>
            <div className="case-label">Evidence you added</div>
            <div className="case-value">
              {evidence === null ? "—" : evidence === 0 ? <span className="muted">Nothing yet</span> : `${evidence} ${evidence === 1 ? "item" : "items"}`} ·{" "}
              <Link href="/evidence">Add evidence</Link>
            </div>
          </div>
        </div>
      </div>
      <div className="case-actions">
        {latest?.status === "ready" && (
          <ButtonAnchor href={`/api/packs/${latest.id}/pdf`} variant="secondary" size="sm" icon={<Download size={16} strokeWidth={1.75} aria-hidden="true" />}>
            Download PDF
          </ButtonAnchor>
        )}
        {latest?.status === "blocked" && (
          <ButtonLink href={`/packs/${latest.id}`} variant="secondary" size="sm" icon={<TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" />}>
            See why it was blocked
          </ButtonLink>
        )}
      </div>
    </Card>
  );
}
