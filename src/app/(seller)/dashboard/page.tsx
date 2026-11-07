"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardData } from "@/lib/ui/data";
import { api, time } from "@/lib/ui/client";
import { AlertsCard, AskCard, DigitalCard, FiguresCard, LaunchCard, PackCard, TrackingCard, VerificationBadge } from "./parts";

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
      <section className="card">
        <h1>Log in to see your standing</h1>
        <p className="muted">Standing reads your PayPal sandbox account to show the signals PayPal publishes.</p>
        <a className="button" href="/api/auth/paypal/start">
          Log in with PayPal
        </a>
      </section>
    );
  }
  if (status === "error") return <p className="error">Something went wrong loading your dashboard. Please refresh.</p>;
  if (!data) return <p className="muted">Loading…</p>;

  // Counted by code from the open warnings; calm notes such as "New seller" don't count.
  const needing = data.alerts.filter((a) => a.severity === "warning").length;
  const headline = needing === 0 ? "Nothing needs you right now" : needing === 1 ? "One thing needs you" : `${needing} things need you`;
  const lastSync = data.sync.map((s) => s.lastRunAt).filter(Boolean).sort().at(-1);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{headline}</h1>
          <p className="muted small">
            {lastSync ? `Last synced with PayPal ${time(lastSync)}` : "Not synced with PayPal yet"}
            {data.sync.some((s) => !s.ok) && <span className="error"> · the last sync had a problem</span>}
          </p>
        </div>
        <VerificationBadge item={data.verification} />
      </div>
      <div className="stack">
        <AlertsCard alerts={data.alerts} />
        <FiguresCard data={data} />
        <TrackingCard gaps={data.tracking} onChange={load} />
        <div className="grid">
          <DigitalCard gaps={data.digital} onChange={load} />
          <PackCard latest={data.latestPack} />
        </div>
        <div className="grid">
          <AskCard />
          <LaunchCard plans={data.launchPlans} onChange={load} />
        </div>
      </div>
    </>
  );
}
