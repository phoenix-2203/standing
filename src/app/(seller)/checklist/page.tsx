"use client";

import { useEffect, useState } from "react";

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

// Minimal checklist; the full onboarding UI comes later. All wording comes from the server or the table above.
export default function ChecklistPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    let live = true;
    const connect = new URLSearchParams(window.location.search).get("connect");
    fetch("/api/checklist").then(async (res) => {
      if (!live) return;
      setNotice(connect ? (CONNECT_MESSAGES[connect] ?? null) : null);
      if (res.status === 401) return setConnected(false);
      setItems(((await res.json()) as { items: Item[] }).items);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <main>
      <h1>Your checklist</h1>
      {notice && <p role="status">{notice}</p>}
      {!connected && (
        <p>
          <a href="/api/auth/paypal/start">Log in with PayPal</a> to see your checklist.
        </p>
      )}
      <ol>
        {items?.map((item) => (
          <li key={item.id}>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
            {item.action && <a href={item.action.href}>{item.action.label}</a>}
          </li>
        ))}
      </ol>
    </main>
  );
}
