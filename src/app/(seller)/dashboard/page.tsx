"use client";

import { LogIn, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button, ButtonAnchor, Callout, EmptyState, PageHeader, Skeleton, SkeletonText } from "@/components/ui";
import { api } from "@/lib/ui/client";
import type { DashboardData } from "@/lib/ui/data";
import { dateTime, relative } from "@/lib/ui/format";
import { BuildPackButton } from "@/components/app/BuildPackButton";
import { AskEntry, NeedsYou, WhereYouStand, YourCase } from "./overview";
import { DigitalCard, LaunchCard, TrackingCard } from "./parts";
import Link from "next/link";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "signed_out" | "error">("loading");

  const load = useCallback(async () => {
    const res = await api<DashboardData>("/api/dashboard");
    if (res.status === 401) return setStatus("signed_out");
    if (res.status !== 200 || !res.data) return setStatus("error");
    setData(res.data);
    setStatus("ok");
  }, []);

  useEffect(() => {
    // Fetching on mount is the point of this effect; setState happens after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (status === "signed_out") {
    return (
      <div className="dash-signed-out">
        <EmptyState
          icon={LogIn}
          title="Log in to see where you stand"
          action={
            <ButtonAnchor href="/api/auth/paypal/start">
              Log in with PayPal
            </ButtonAnchor>
          }
        >
          Standing reads your PayPal sandbox account to show the signals PayPal publishes for holding funds. Test accounts only.{" "}
          <Link href="/guide">How Standing works</Link>
        </EmptyState>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="dash-error">
        <Callout
          tone="bad"
          title="Couldn't load your dashboard"
          action={
            <Button size="sm" variant="secondary" onClick={() => void load()} icon={<RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" />}>
              Try again
            </Button>
          }
        >
          Standing couldn&apos;t read its own records just now. Nothing was sent to PayPal.
        </Callout>
      </div>
    );
  }
  if (!data) return <DashboardSkeleton />;

  // Counted by code from the open warnings; calm notes such as "New seller" don't count.
  const needing = data.alerts.filter((a) => a.severity === "warning").length;
  const lastSync = data.sync
    .map((s) => s.lastRunAt)
    .filter((x): x is string => !!x)
    .sort()
    .at(-1);
  const title = needing === 0 ? "Nothing needs you right now" : needing === 1 ? "1 thing needs you" : `${needing} things need you`;
  return (
    <>
      <PageHeader
        title={title}
        description={
          <span title={lastSync ? relative(lastSync) : undefined}>
            {lastSync ? `Last checked with PayPal ${dateTime(lastSync)}` : "Not synced with PayPal yet"}
          </span>
        }
        action={<BuildPackButton />}
      />
      {data.sync.some((s) => !s.ok) && (
        <div className="dash-callout">
          <Callout tone="warn" title="The last sync with PayPal had a problem">
            {lastSync ? `Showing data from ${dateTime(lastSync)}. ` : ""}Standing tries again every 15 minutes.
          </Callout>
        </div>
      )}

      <div className="dash2">
        <div className="dash2-main">
          <section aria-labelledby="needs-h" className="dash-section">
            <div className="dash-section-head">
              <h2 id="needs-h">Needs you</h2>
            </div>
            <NeedsYou alerts={data.alerts} />
          </section>
          {data.tracking.length > 0 && <TrackingCard gaps={data.tracking} onChange={load} />}
          {data.digital.length > 0 && <DigitalCard gaps={data.digital} onChange={load} />}
          <WhereYouStand rows={data.standing} metrics={data.metrics} thresholds={data.thresholds} />
        </div>
        <aside className="dash2-side" aria-label="Your case">
          <YourCase latest={data.latestPack} />
          <LaunchCard plans={data.launchPlans} onChange={load} />
          <AskEntry />
        </aside>
      </div>
    </>
  );
}

/** Loading: the final layout in grey, so nothing jumps when the data arrives. */
function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your dashboard">
      <div className="ui-page-header">
        <div style={{ width: "min(28rem, 80%)" }}>
          <Skeleton height={36} width="70%" />
          <div style={{ height: 10 }} />
          <Skeleton height={14} width="45%" />
        </div>
        <Skeleton height={40} width={130} radius={6} />
      </div>
      <div className="dash2">
        <div className="dash2-main">
          <Skeleton height={150} radius={10} />
          <div className="tiles">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} height={150} radius={10} />
            ))}
          </div>
        </div>
        <div className="dash2-side">
          <div className="ui-card">
            <SkeletonText lines={4} />
          </div>
          <div className="ui-card">
            <SkeletonText lines={5} />
          </div>
        </div>
      </div>
    </div>
  );
}
