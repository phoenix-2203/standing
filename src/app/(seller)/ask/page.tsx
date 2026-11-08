"use client";

import { ArrowUp, MessageCircleQuestion } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Button, Callout, PageHeader } from "@/components/ui";
import { SUGGESTED_QUESTIONS as SUGGESTED } from "@/lib/ui/ask";
import { api } from "@/lib/ui/client";

// Ask Standing as a chat. The answer is exactly what /api/ask returns: code-written facts with their citations,
// the AI's checked linking sentences, or a fixed refusal. The thread lives only in this tab.

type AskResponse = { decision: "answer" | "refuse" | "no_data"; text: string; sentences: { kind: "fact" | "bridge"; text: string; citations: string[] }[] };
type Turn = { q: string; a?: AskResponse; error?: string };


export default function AskPage() {
  return (
    <Suspense fallback={null}>
      <AskChat />
    </Suspense>
  );
}

function AskChat() {
  const params = useSearchParams();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q) return;
    setBusy(true);
    setDraft("");
    setTurns((t) => [...t, { q }]);
    const res = await api<AskResponse>("/api/ask", { method: "POST", body: JSON.stringify({ question: q }) });
    setBusy(false);
    setTurns((t) => {
      const next = [...t];
      next[next.length - 1] =
        res.status === 200 && res.data ? { q, a: res.data } : { q, error: res.status === 401 ? "Log in to ask about your account." : "Standing couldn't answer right now. Please try again in a minute." };
      return next;
    });
    inputRef.current?.focus();
  }, []);

  // A question passed from the dashboard (?q=…) is asked once, as if typed here.
  useEffect(() => {
    const q = params.get("q");
    if (q && !asked.current) {
      asked.current = true;
      void ask(q.slice(0, 500));
    }
  }, [params, ask]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns]);

  return (
    <div className="chat-page">
      <PageHeader title="Ask Standing" description="Answers come only from your Standing data: metrics, alerts, PayPal policy clauses and evidence. Every figure is written by code." />

      <div className="chat-thread" aria-live="polite">
        {turns.length === 0 && (
          <div className="chat-empty">
            <MessageCircleQuestion size={28} strokeWidth={1.5} aria-hidden="true" />
            <p>Ask about your sales, alerts, tracking or a PayPal policy. Try one of these:</p>
            <Suggestions onPick={(q) => void ask(q)} disabled={busy} />
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="chat-turn">
            <div className="chat-q">
              <span className="sr-only">You asked: </span>
              {t.q}
            </div>
            {t.a ? (
              <Answer a={t.a} />
            ) : t.error ? (
              <Callout tone="warn">{t.error}</Callout>
            ) : (
              <div className="chat-a chat-thinking" aria-busy="true">
                <span className="ui-spinner" aria-hidden="true" /> Checking your records…
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }}
      >
        {turns.length > 0 && <Suggestions onPick={(q) => void ask(q)} disabled={busy} compact />}
        <div className="chat-input-row">
          <label htmlFor="ask-input" className="sr-only">
            Your question
          </label>
          <textarea
            id="ask-input"
            ref={inputRef}
            className="ui-input chat-input"
            rows={1}
            maxLength={500}
            value={draft}
            placeholder="Ask about your account…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!busy) void ask(draft);
              }
            }}
          />
          <Button type="submit" loading={busy} disabled={!draft.trim()} icon={<ArrowUp size={16} strokeWidth={2} aria-hidden="true" />}>
            Ask
          </Button>
        </div>
      </form>
    </div>
  );
}

function Answer({ a }: { a: AskResponse }) {
  if (a.decision === "refuse") {
    return (
      <div className="chat-a chat-a-plain">
        <Callout tone="info" title="Standing won't help with that">
          {a.text}
        </Callout>
      </div>
    );
  }
  if (a.decision === "no_data") return <div className="chat-a muted">{a.text}</div>;
  return (
    <div className="chat-a">
      <p>
        {a.sentences.map((s, i) => (
          <span key={i}>{s.text} </span>
        ))}
      </p>
      {a.sentences.some((s) => s.citations.length) && (
        <div className="chat-cites" aria-label="Sources">
          {[...new Set(a.sentences.flatMap((s) => s.citations))].map((c) => (
            <span key={c} className="chat-cite mono" title="Source in your Standing data">
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Suggestions({ onPick, disabled, compact = false }: { onPick: (q: string) => void; disabled: boolean; compact?: boolean }) {
  return (
    <div className={`chat-chips${compact ? " chat-chips-compact" : ""}`} role="group" aria-label="Suggested questions">
      {SUGGESTED.map((q) => (
        <button key={q} type="button" className="chat-chip" disabled={disabled} onClick={() => onPick(q)}>
          {q}
        </button>
      ))}
    </div>
  );
}
