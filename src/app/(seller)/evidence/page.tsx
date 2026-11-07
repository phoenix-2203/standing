"use client";

import { useCallback, useEffect, useState } from "react";
import { api, day } from "@/lib/ui/client";

// The seller's own evidence: supplier invoices and where a spike came from. Each item becomes a numbered
// piece of evidence the next pack can cite. Summaries are written by code from what is entered here.

interface Item {
  id: string;
  kind: "invoice" | "traffic_source" | "digital_delivery" | string;
  occurredAt: string;
  summary: string;
  simulated: boolean;
}

const KIND_LABEL: Record<string, string> = { invoice: "Supplier invoice", traffic_source: "Traffic source", digital_delivery: "Delivery proof" };
const today = () => new Date().toISOString().slice(0, 10);

type Line = { description: string; quantity: string };
const EMPTY_LINE: Line = { description: "", quantity: "1" };

async function post(path: string, body: unknown): Promise<string | null> {
  const res = await api<{ error?: string }>(path, { method: "POST", body: JSON.stringify(body) });
  return res.status === 201 ? null : (res.data?.error ?? "That couldn't be saved. Please try again.");
}

function SimulatedBox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <input type="checkbox" style={{ width: "auto" }} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      This is test data: label it &ldquo;Simulated&rdquo; everywhere it appears
    </label>
  );
}

function InvoiceForm({ onSaved }: { onSaved: () => void }) {
  const [supplier, setSupplier] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [date, setDate] = useState(today());
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY_LINE }]);
  const [simulated, setSimulated] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const problem = await post("/api/evidence/invoices", {
      supplier,
      invoiceNumber,
      date,
      simulated,
      lines: lines.filter((l) => l.description.trim()).map((l) => ({ description: l.description, quantity: Number(l.quantity) })),
    });
    setBusy(false);
    setError(problem);
    if (!problem) {
      setSupplier("");
      setInvoiceNumber("");
      setLines([{ ...EMPTY_LINE }]);
      onSaved();
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-row">
        <label>
          Supplier
          <input required maxLength={120} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Wax & Wick Supplies" />
        </label>
        <label>
          Invoice number
          <input required maxLength={60} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-1042" />
        </label>
        <label>
          Invoice date
          <input required type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="small">Lines: use your product names or SKUs, so Standing can match them to what you sold</legend>
        {lines.map((l, i) => (
          <div className="form-row" key={i}>
            <label>
              Description
              <input required={i === 0} maxLength={200} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Lavender soy candle" />
            </label>
            <label style={{ maxWidth: "8rem" }}>
              Quantity
              <input type="number" min={1} step={1} inputMode="numeric" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
            </label>
            {lines.length > 1 && (
              <button type="button" className="secondary" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`} style={{ alignSelf: "end" }}>
                Remove
              </button>
            )}
          </div>
        ))}
        {lines.length < 50 && (
          <button type="button" className="secondary" onClick={() => setLines([...lines, { ...EMPTY_LINE }])}>
            Add a line
          </button>
        )}
      </fieldset>
      <SimulatedBox checked={simulated} onChange={setSimulated} />
      <div>
        <button disabled={busy}>{busy ? "Saving…" : "Add invoice"}</button>
      </div>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function TrafficForm({ onSaved }: { onSaved: () => void }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [date, setDate] = useState(today());
  const [simulated, setSimulated] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const problem = await post("/api/evidence/traffic-sources", { label, url, date, simulated });
    setBusy(false);
    setError(problem);
    if (!problem) {
      setLabel("");
      setUrl("");
      onSaved();
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-row">
        <label>
          What sent people to you
          <input required maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Video: pouring the lavender candle" />
        </label>
        <label>
          Link (https)
          <input required type="url" pattern="https://.*" maxLength={500} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </label>
        <label>
          Started on
          <input required type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <SimulatedBox checked={simulated} onChange={setSimulated} />
      <div>
        <button disabled={busy}>{busy ? "Saving…" : "Add traffic source"}</button>
      </div>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export default function EvidencePage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "signed_out" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return api<{ items: Item[] }>("/api/evidence").then((res) => {
      if (res.status === 401) return setState("signed_out");
      if (res.status !== 200 || !res.data) return setState("failed");
      setItems(res.data.items);
      setState("ok");
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(item: Item) {
    const res = await api(`/api/evidence/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    setError(res.status === 204 ? null : "That item couldn't be removed.");
    await load();
  }

  if (state === "signed_out") {
    return (
      <section className="card">
        <h1>Log in to see your evidence</h1>
        <a className="button" href="/api/auth/paypal/start">
          Log in with PayPal
        </a>
      </section>
    );
  }
  if (state === "failed") return <p className="muted">Your evidence couldn&apos;t be loaded. Please try again.</p>;
  if (!items) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Evidence</h1>
          <p className="muted small">
            PayPal&apos;s records show what sold. Add what PayPal can&apos;t see: where your stock came from and what sent buyers to you. Each item becomes numbered evidence the next pack can cite. Standing
            stores what you enter as written and never visits the links.
          </p>
        </div>
      </div>

      <div className="stack">
        <section className="card" aria-labelledby="yours-h">
          <h2 id="yours-h">What you&apos;ve added</h2>
          {items.length === 0 ? (
            <p className="muted">Nothing yet. A supplier invoice and the post that started a spike are the two things that help a pack most.</p>
          ) : (
            <div className="rows">
              {items.map((e) => (
                <div key={e.id} className="row">
                  <div style={{ minWidth: 0, flex: "1 1 20rem" }}>
                    <strong>{KIND_LABEL[e.kind] ?? e.kind}</strong> {e.simulated && <span className="badge warn">Simulated</span>}
                    <div className="small">{e.summary}</div>
                    <div className="muted small mono">
                      {e.id} · {day(e.occurredAt)}
                    </div>
                  </div>
                  <button className="secondary" onClick={() => void remove(e)} aria-label={`Remove ${e.id}`}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          {error && (
            <p className="error small" role="alert">
              {error}
            </p>
          )}
          <p className="muted small" style={{ margin: "0.75rem 0 0" }}>
            Removing an item doesn&apos;t change packs already built: each pack keeps its own copy of what it cited.
          </p>
        </section>

        <section className="card" aria-labelledby="invoice-h">
          <h2 id="invoice-h">Add a supplier invoice</h2>
          <InvoiceForm onSaved={() => void load()} />
        </section>

        <section className="card" aria-labelledby="traffic-h">
          <h2 id="traffic-h">Add a traffic source</h2>
          <TrafficForm onSaved={() => void load()} />
        </section>
      </div>
    </>
  );
}
