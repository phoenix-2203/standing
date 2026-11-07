"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/ui/client";

interface Item {
  id: string;
  state: "done" | "todo" | "unknown";
  title: string;
  detail: string;
  action?: { label: string; href: string };
}

const CONNECT_MESSAGES: Record<string, string> = {
  verified: "Connected. PayPal reports this account as verified.",
  unverified: "Connected. PayPal reports this account as unverified.",
  unreadable: "Connected, but we couldn't read your verification status.",
  cancelled: "You cancelled the PayPal login. Nothing was changed.",
  failed: "The PayPal login didn't complete. Please try again.",
  bad_state: "That login link has expired. Please try again.",
  not_allowed: "This PayPal account isn't allowed on this Standing workspace.",
};

const STATE_LABEL = { done: "Done", todo: "To do", unknown: "Unknown" } as const;
const STATE_TONE = { done: "ok", todo: "warn", unknown: "info" } as const;

// All wording comes from the server or the table above.
export default function ChecklistPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    let live = true;
    const connect = new URLSearchParams(window.location.search).get("connect");
    void api<{ items: Item[] }>("/api/checklist").then((res) => {
      if (!live) return;
      setNotice(connect ? (CONNECT_MESSAGES[connect] ?? null) : null);
      if (res.status === 401) return setConnected(false);
      setItems(res.data?.items ?? []);
    });
    return () => {
      live = false;
    };
  }, []);

  const done = items?.filter((i) => i.state === "done").length ?? 0;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Your checklist</h1>
          <p className="muted small">What to have ready before PayPal asks.{items ? ` ${done} of ${items.length} done.` : ""}</p>
        </div>
      </div>
      {notice && (
        <p role="status" className="alert info" style={{ marginBottom: "1rem" }}>
          {notice}
        </p>
      )}
      {!connected && (
        <section className="card">
          <p>Log in with PayPal to see your checklist.</p>
          <a className="button" href="/api/auth/paypal/start">
            Log in with PayPal
          </a>
        </section>
      )}
      {items && (
        <ol className="rows" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((item, i) => (
            <li key={item.id} className="card" style={{ display: "flex", gap: "1rem", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: "1 1 20rem" }}>
                <h2 style={{ marginBottom: "0.25rem" }}>
                  {i + 1}. {item.title}
                </h2>
                <p className="muted" style={{ marginBottom: item.action ? "0.5rem" : 0 }}>
                  {item.detail}
                </p>
                {item.action && (
                  <a className="button secondary" href={item.action.href}>
                    {item.action.label}
                  </a>
                )}
              </div>
              <span className={`badge ${STATE_TONE[item.state]}`}>{STATE_LABEL[item.state]}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
