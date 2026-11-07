"use client";

import { useCallback, useEffect, useState } from "react";
import type { CatalogueView } from "@/lib/catalogue/catalogue";
import { api } from "@/lib/ui/client";

const KIND_LABEL = { physical: "Physical", digital: "Digital", service: "Service" } as const;
type Kind = keyof typeof KIND_LABEL;
type Draft = { name: string; sku: string; kind: Kind | ""; category: string };

async function save(draft: Draft): Promise<string | null> {
  const res = await api<{ error?: string }>("/api/products", { method: "POST", body: JSON.stringify(draft) });
  return res.status === 201 ? null : (res.data?.error ?? "The product couldn't be saved.");
}

function KindSelect({ value, onChange }: { value: Draft["kind"]; onChange: (k: Draft["kind"]) => void }) {
  return (
    <select required value={value} onChange={(e) => onChange(e.target.value as Draft["kind"])}>
      <option value="" disabled>
        Choose…
      </option>
      {Object.entries(KIND_LABEL).map(([k, label]) => (
        <option key={k} value={k}>
          {label}
        </option>
      ))}
    </select>
  );
}

// One product PayPal's orders mention that the catalogue doesn't cover yet. The seller picks the kind.
function UnmatchedRow({ item, onSaved }: { item: CatalogueView["unmatched"][number]; onSaved: () => void }) {
  const title = item.name ?? `SKU ${item.sku}`;
  const [kind, setKind] = useState<Draft["kind"]>("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const problem = await save({ name: title, sku: item.sku ?? "", kind, category });
    setBusy(false);
    setError(problem);
    if (!problem) onSaved();
  }
  return (
    <form className="form" onSubmit={submit} style={{ paddingBlock: "0.75rem", borderTop: "1px solid var(--line)" }}>
      <div>
        <strong>{title}</strong>
        <div className="muted small">
          {item.orders} {item.orders === 1 ? "order" : "orders"}
          {item.name && item.sku ? ` · SKU ${item.sku}` : ""}
        </div>
      </div>
      <div className="form-row">
        <label>
          Kind
          <KindSelect value={kind} onChange={setKind} />
        </label>
        <label>
          Category (optional)
          <input list="catalogue-categories" maxLength={60} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Candles" />
        </label>
      </div>
      <div>
        <button disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

const EMPTY: Draft = { name: "", sku: "", kind: "", category: "" };

export default function CataloguePage() {
  const [view, setView] = useState<CatalogueView | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "signed_out" | "failed">("loading");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return api<CatalogueView>("/api/products").then((res) => {
      if (res.status === 401) return setState("signed_out");
      if (res.status !== 200 || !res.data) return setState("failed");
      setView(res.data);
      setState("ok");
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const problem = await save(draft);
    setBusy(false);
    setError(problem);
    if (!problem) {
      setDraft(EMPTY);
      await load();
    }
  }

  async function remove(id: string) {
    const res = await api(`/api/products/${id}`, { method: "DELETE" });
    setError(res.status === 204 ? null : "That product couldn't be removed.");
    await load();
  }

  if (state === "signed_out") {
    return (
      <section className="card">
        <h1>Log in to see your catalogue</h1>
        <a className="button" href="/api/auth/paypal/start">
          Log in with PayPal
        </a>
      </section>
    );
  }
  if (state === "failed") return <p className="muted">The catalogue couldn&apos;t be loaded. Please try again.</p>;
  if (!view) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Catalogue</h1>
          <p className="muted small">
            PayPal&apos;s reports don&apos;t say whether an order is physical or digital. Tell Standing here, and it can check tracking and Completed status on the right orders.
          </p>
        </div>
      </div>
      <datalist id="catalogue-categories">
        {view.categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="stack">
        {view.ordersWithoutProductDetails > 0 && (
          <p role="status" className="alert info" style={{ margin: 0 }}>
            {view.ordersWithoutProductDetails} {view.ordersWithoutProductDetails === 1 ? "order has" : "orders have"} no product name or SKU in PayPal, so the catalogue can&apos;t match{" "}
            {view.ordersWithoutProductDetails === 1 ? "it" : "them"}. {view.ordersWithoutProductDetails === 1 ? "It stays" : "They stay"} unclassified.
          </p>
        )}

        {view.unmatched.length > 0 && (
          <section className="card" aria-labelledby="unmatched-h">
            <h2 id="unmatched-h">Seen in your orders</h2>
            <p className="muted small" style={{ marginBottom: "0.25rem" }}>
              From the last 90 days of PayPal payments, and not in your catalogue yet.
            </p>
            {view.unmatched.map((item) => (
              <UnmatchedRow key={`${item.sku ?? ""}|${item.name ?? ""}`} item={item} onSaved={() => void load()} />
            ))}
          </section>
        )}

        <section className="card" aria-labelledby="add-h">
          <h2 id="add-h">Add a product</h2>
          <form className="form" onSubmit={add}>
            <div className="form-row">
              <label>
                Product name, as it appears on the order
                <input required maxLength={200} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Lavender soy candle" />
              </label>
              <label>
                SKU (optional)
                <input maxLength={100} value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} />
              </label>
            </div>
            <div className="form-row">
              <label>
                Kind
                <KindSelect value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind })} />
              </label>
              <label>
                Category (optional)
                <input list="catalogue-categories" maxLength={60} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="e.g. Candles" />
              </label>
            </div>
            <div>
              <button disabled={busy}>{busy ? "Saving…" : "Add product"}</button>
            </div>
          </form>
          {error && (
            <p className="error small" role="alert">
              {error}
            </p>
          )}
        </section>

        <section className="card" aria-labelledby="products-h">
          <h2 id="products-h">Your products</h2>
          {view.products.length === 0 ? (
            <p className="muted">No products yet.</p>
          ) : (
            <div className="rows">
              {view.products.map((p) => (
                <div key={p.id} className="row">
                  <div style={{ minWidth: 0 }}>
                    <strong>{p.name}</strong>
                    <div className="muted small">{[p.kind ? KIND_LABEL[p.kind] : "Kind not set", p.category, p.sku ? `SKU ${p.sku}` : null].filter(Boolean).join(" · ")}</div>
                  </div>
                  <button className="secondary" onClick={() => void remove(p.id)} aria-label={`Remove ${p.name}`}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="muted small" style={{ margin: "0.75rem 0 0" }}>
            Figures and the checklist update straight away. Signals update at the next check, within 15 minutes.
          </p>
        </section>
      </div>
    </>
  );
}
