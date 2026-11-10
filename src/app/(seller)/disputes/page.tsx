"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  EmptyState,
  PageHeader,
  SimulatedBadge,
} from "@/components/ui";
import type { DisputeResponse, DisputeRow } from "@/lib/disputes/respond";
import { api, day } from "@/lib/ui/client";

// Disputes PayPal reports, and a response built from the evidence Standing already holds for the disputed payment.
// Written by code from the records; Standing doesn't send it, because the seller should read it first.

export default function DisputesPage() {
  const [rows, setRows] = useState<DisputeRow[] | null>(null);
  const [state, setState] = useState<
    "loading" | "ok" | "signed_out" | "failed"
  >("loading");
  const [open, setOpen] = useState<DisputeResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ disputes: DisputeRow[] }>("/api/disputes").then((res) => {
      if (res.status === 401) return setState("signed_out");
      if (res.status !== 200 || !res.data) return setState("failed");
      setRows(res.data.disputes);
      setState("ok");
    });
  }, []);

  async function draft(id: string) {
    setBusy(id);
    setCopied(false);
    const res = await api<DisputeResponse>(
      `/api/disputes/${encodeURIComponent(id)}/response`,
    );
    setBusy(null);
    if (res.status === 200 && res.data) {
      setOpen(res.data);
      setError(null);
    } else
      setError("The response couldn't be built right now. Please try again.");
  }

  async function copy() {
    if (!open) return;
    try {
      await navigator.clipboard.writeText(open.draft);
      setCopied(true);
    } catch {
      setError("Copy didn't work here: select the text and copy it instead.");
    }
  }

  if (state === "signed_out") {
    return (
      <Card title="Log in to see your disputes">
        <a className="button" href="/api/auth/paypal/start">
          Log in with PayPal
        </a>
      </Card>
    );
  }
  if (state === "failed")
    return (
      <Callout tone="bad">
        Your disputes couldn&apos;t be loaded. Please try again.
      </Callout>
    );

  return (
    <>
      <PageHeader
        eyebrow="Disputes"
        title="Answer a dispute with your own records"
        description="When a buyer opens a dispute, Standing gathers what your records show for that payment and writes a response for you to check and send in PayPal's Resolution Center."
      />
      <div className="stack">
        {rows && rows.length === 0 && (
          <EmptyState title="No disputes">
            PayPal hasn&apos;t reported a dispute on your account. If one opens,
            it appears here within 15 minutes.
          </EmptyState>
        )}
        {rows && rows.length > 0 && (
          <Card title="Your disputes">
            <div className="rows">
              {rows.map((d) => (
                <div
                  key={d.disputeId}
                  className="row"
                  style={{ flexWrap: "wrap", gap: "0.75rem" }}
                >
                  <div style={{ minWidth: 0, flex: "1 1 22rem" }}>
                    <strong>{d.reasonLabel}</strong>{" "}
                    <Badge tone="warn">
                      {d.status.toLowerCase().replace(/_/g, " ")}
                    </Badge>{" "}
                    {d.simulated && (
                      <SimulatedBadge title="A demo dispute, not from PayPal" />
                    )}
                    <div className="muted small mono">
                      {d.disputeId} · {d.amountText} · payment{" "}
                      {d.transactionIds.join(", ")} · opened {day(d.openedAt)}
                    </div>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => void draft(d.disputeId)}
                    disabled={busy === d.disputeId}
                  >
                    {busy === d.disputeId ? "Building…" : "Draft a response"}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}
        {error && <Callout tone="bad">{error}</Callout>}
        {open && (
          <Card
            id="response"
            title={`Response for ${open.dispute.disputeId}`}
            description="Written by Standing from your records, not by the AI. Check it, fill the bracketed blanks, then send it yourself in PayPal's Resolution Center. Standing can't say how PayPal or the buyer will decide."
          >
            <div className="stack">
              {open.dispute.simulated && (
                <Callout tone="info" title="Simulated dispute">
                  This dispute was created for the demo on a real sandbox
                  payment. It isn&apos;t from PayPal.
                </Callout>
              )}
              {open.missing && (
                <Callout
                  tone="warn"
                  title="Worth adding first"
                  action={
                    <ButtonLink
                      href={open.missing.href}
                      size="sm"
                      variant="secondary"
                    >
                      Fix it
                    </ButtonLink>
                  }
                >
                  {open.missing.text}
                </Callout>
              )}
              <div>
                <h3 className="small" style={{ margin: "0 0 0.4rem" }}>
                  Evidence used ({open.evidence.length})
                </h3>
                <ol style={{ margin: 0, paddingLeft: "1.2rem" }}>
                  {open.evidence.map((e) => (
                    <li key={e.id} style={{ marginBottom: "0.35rem" }}>
                      {e.summary} {e.simulated && <SimulatedBadge />}{" "}
                      <span className="muted small mono">{e.id}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <label>
                Response ({open.blanks.length} blanks to fill)
                <textarea
                  readOnly
                  rows={Math.min(18, open.draft.split("\n").length + 2)}
                  value={open.draft}
                />
              </label>
              <div>
                <button onClick={() => void copy()}>
                  {copied ? "Copied" : "Copy response"}
                </button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
