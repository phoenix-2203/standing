"use client";

import { AllCommunityModule, type ColDef, colorSchemeDark, ModuleRegistry, themeQuartz } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useEffect, useMemo, useState } from "react";
import type { OrderRow } from "@/lib/ui/data";
import { api } from "@/lib/ui/client";

ModuleRegistry.registerModules([AllCommunityModule]);

const lightTheme = themeQuartz;
const darkTheme = themeQuartz.withPart(colorSchemeDark);

const columns: ColDef<OrderRow>[] = [
  {
    field: "date",
    headerName: "Date",
    sort: "desc",
    minWidth: 160,
    valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""),
  },
  { field: "transactionId", headerName: "PayPal payment", minWidth: 190, cellClass: "mono" },
  { field: "amount", headerName: "Amount", type: "numericColumn", minWidth: 110, valueFormatter: (p) => `USD ${Number(p.value).toFixed(2)}` },
  { field: "kind", headerName: "Kind", minWidth: 120 },
  { field: "categories", headerName: "Category", minWidth: 120 },
  {
    field: "tracking",
    headerName: "Tracking / Completed",
    minWidth: 220,
    flex: 1,
    cellStyle: (p) => (p.value === "missing" ? { color: "var(--warn)", fontWeight: 600 } : null),
  },
  { field: "evidence", headerName: "Evidence", type: "numericColumn", minWidth: 100 },
  { field: "fix", headerName: "Standing fix", minWidth: 120, valueFormatter: (p) => (p.value as string | null) ?? "—" },
];

export default function OrdersPage() {
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "signed_out" | "error">("loading");
  const [search, setSearch] = useState("");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let live = true;
    void api<{ rows: OrderRow[] }>("/api/orders").then((res) => {
      if (!live) return;
      if (res.status === 401) return setState("signed_out");
      if (res.status !== 200 || !res.data) return setState("error");
      setRows(res.data.rows);
      setState("ok");
    });
    return () => {
      live = false;
    };
  }, []);

  const missing = useMemo(() => rows?.filter((r) => r.tracking === "missing").length ?? 0, [rows]);

  if (state === "signed_out") {
    return (
      <section className="card">
        <h1>Log in to see your orders</h1>
        <a className="button" href="/api/auth/paypal/start">
          Log in with PayPal
        </a>
      </section>
    );
  }
  if (state === "error") return <p className="error">Something went wrong loading your orders. Please refresh.</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Orders</h1>
          <p className="muted small">
            PayPal payments from the last 90 days{rows ? ` · ${rows.length} orders` : ""}
            {missing > 0 && <span style={{ color: "var(--warn)" }}> · {missing} physical {missing === 1 ? "order is" : "orders are"} missing tracking</span>}
          </p>
        </div>
        <label style={{ minWidth: "min(100%, 16rem)" }}>
          Search
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Payment ID, kind, tracking…" />
        </label>
      </div>
      <div className="card" style={{ padding: 0, height: "min(70vh, 640px)" }}>
        {rows ? (
          <AgGridReact<OrderRow>
            theme={dark ? darkTheme : lightTheme}
            rowData={rows}
            columnDefs={columns}
            defaultColDef={{ sortable: true, filter: true, resizable: true }}
            quickFilterText={search}
            pagination
            paginationPageSize={25}
            paginationPageSizeSelector={[25, 50, 100]}
            overlayNoRowsTemplate="No PayPal payments in the last 90 days yet."
          />
        ) : (
          <p className="muted" style={{ padding: "1rem" }}>
            Loading…
          </p>
        )}
      </div>
      <p className="muted small" style={{ marginTop: "0.75rem" }}>
        &ldquo;Unclassified&rdquo; means the order&apos;s products aren&apos;t in your catalogue yet, so Standing can&apos;t tell physical from digital.
      </p>
    </>
  );
}
