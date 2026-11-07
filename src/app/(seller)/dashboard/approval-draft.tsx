"use client";

import { useState } from "react";
import { api } from "@/lib/ui/client";

type Draft = { subject: string; body: string; blanks: string[] };

// "Draft a request" next to a product that needs PayPal's pre-approval. Code fills a template; the seller
// fills the [BLANKS] and sends it themselves. Standing never sends it.
export function ApprovalDraftButton({ name, clauseId }: { name: string; clauseId: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function open() {
    const res = await api<Draft & { error?: string }>("/api/policy/approval-draft", { method: "POST", body: JSON.stringify({ name, clauseId }) });
    if (res.status === 200 && res.data) {
      setDraft(res.data);
      setError(null);
    } else setError(res.data?.error ?? "The draft couldn't be made.");
  }

  async function copy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
      setCopied(true);
    } catch {
      setError("Copy didn't work here: select the text and copy it instead.");
    }
  }

  if (!draft) {
    return (
      <>
        <button type="button" className="secondary small" onClick={() => void open()}>
          Draft a pre-approval request
        </button>
        {error && <span className="error small">{error}</span>}
      </>
    );
  }
  return (
    <div className="stack" style={{ width: "100%" }}>
      <p className="muted small" style={{ margin: 0 }}>
        Written by Standing from a template, quoting PayPal&apos;s policy word for word. Fill the {draft.blanks.length} bracketed blanks, then send it to PayPal yourself. Standing doesn&apos;t send it, and
        can&apos;t say what PayPal will decide.
      </p>
      <label>
        Subject
        <input readOnly value={draft.subject} />
      </label>
      <label>
        Message
        <textarea readOnly rows={14} value={draft.body} />
      </label>
      <div>
        <button type="button" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy subject and message"}
        </button>{" "}
        <button type="button" className="secondary" onClick={() => setDraft(null)}>
          Close
        </button>
      </div>
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
