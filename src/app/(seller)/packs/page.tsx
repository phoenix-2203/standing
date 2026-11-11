"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, day, time } from "@/lib/ui/client";

type PackSummary = { id: string; status: string; createdAt: string; periodFrom: string; periodTo: string; attempts: number };

export default function PacksPage() {
  const router = useRouter();
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "signed_out" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void api<{ packs: PackSummary[] }>("/api/packs").then((res) => {
      if (!live) return;
      if (res.status === 401) return setState("signed_out");
      if (res.status !== 200 || !res.data) return setState("error");
      setPacks(res.data.packs);
      setState("ok");
    });
    return () => {
      live = false;
    };
  }, []);

  async function build() {
    setBusy(true);
    setError(null);
    const res = await api<{ id?: string; error?: string }>("/api/packs", { method: "POST" });
    setBusy(false);
    if (res.status === 201 && res.data?.id) router.push(`/packs/${res.data.id}`);
    else setError(res.data?.error ?? "The pack couldn't be built.");
  }

  if (state === "signed_out") {
    return (
      <section className="card">
        <h1>Log in to see your packs</h1>
        <a className="button" href="/api/auth/paypal/start">
          Log in with PayPal
        </a>
      </section>
    );
  }
  if (state === "error") return <p className="error">Something went wrong loading your packs. Please refresh.</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Explanation packs</h1>
          <p className="muted small">Your case, built from your PayPal records before anyone asks.</p>
        </div>
        <button onClick={build} disabled={busy}>
          {busy ? "Building… (up to a minute)" : "Build a new pack"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <section className="card">
        {!packs ? (
          <p className="muted">Loading…</p>
        ) : packs.length === 0 ? (
          <p className="muted">No packs yet. Build one to see how your case reads. <Link href="/guide#tour">How packs work</Link></p>
        ) : (
          <div className="rows">
            {packs.map((p) => (
              <Link key={p.id} href={`/packs/${p.id}`} className="row" style={{ color: "inherit", textDecoration: "none" }}>
                <span>
                  {time(p.createdAt)}
                  <span className="muted small">
                    {" "}
                    · covers {day(p.periodFrom)} to {day(p.periodTo)}
                  </span>
                </span>
                <span className={`badge ${p.status === "ready" ? "ok" : "bad"}`}>{p.status === "ready" ? "ready" : "blocked"}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
