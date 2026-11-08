"use client";

import Link from "next/link";
import {
  AllCommunityModule,
  type ColDef,
  type ColGroupDef,
  colorSchemeDark,
  type GridApi,
  type ICellRendererParams,
  type IRowNode,
  ModuleRegistry,
  themeQuartz,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OrderRow, Protection } from "@/lib/ui/data";
import { api } from "@/lib/ui/client";

ModuleRegistry.registerModules([AllCommunityModule]);

// The grid takes The Record's colours and fonts from the page's own tokens, so it matches light and dark.
const params = {
  fontFamily: "inherit",
  headerFontFamily: "inherit",
  fontSize: 14,
  accentColor: "var(--accent)",
  backgroundColor: "var(--surface)",
  foregroundColor: "var(--ink)",
  borderColor: "var(--line)",
  headerBackgroundColor: "var(--bg)",
  headerTextColor: "var(--muted)",
  headerFontWeight: 600,
  headerFontSize: 13,
  wrapperBorderRadius: 10,
  rowHeight: 40,
  headerHeight: 40,
  oddRowBackgroundColor: "var(--surface)", // zebra off
  rowHoverColor: "var(--accent-bg)",
  selectedRowBackgroundColor: "var(--accent-bg)",
  rowBorder: { color: "var(--line)" },
  columnBorder: false,
  focusShadow: { radius: 0, spread: 2, color: "var(--focus)" },
};
const lightTheme = themeQuartz.withParams(params);
const darkTheme = themeQuartz.withPart(colorSchemeDark).withParams(params);

type Row = OrderRow & { pinned?: true };

const PROTECTION: Record<Protection, { label: string; tone: string }> = {
  eligible: { label: "Eligible", tone: "ok" },
  partial: { label: "Partly eligible", tone: "info" },
  "not eligible": { label: "Not eligible", tone: "warn" },
  "not stated": { label: "Not stated", tone: "" },
};
const FIX_TONE: Record<string, string> = {
  sent: "ok",
  preview: "info",
  pending: "info",
  unknown: "warn",
  failed: "bad",
  cancelled: "",
};

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return tone ? (
    <span className={`badge ${tone}`}>{children}</span>
  ) : (
    <span className="muted">{children}</span>
  );
}

const pinned = (p: { node: IRowNode | null }) => Boolean(p.node?.rowPinned);

// "Quick views" are plain filters over fields code already computed; nothing here is a judgement.
const VIEWS = {
  all: { label: "All orders", test: (_: OrderRow) => true },
  missing: {
    label: "Missing tracking",
    test: (r: OrderRow) => r.trackingState === "missing",
  },
  unprotected: {
    label: "Not eligible for Seller Protection",
    test: (r: OrderRow) => r.protection === "not eligible",
  },
  unclassified: {
    label: "Not in your catalogue",
    test: (r: OrderRow) => r.kind === "unclassified",
  },
  fixes: { label: "Has a Standing fix", test: (r: OrderRow) => r.fix !== null },
} as const;
type View = keyof typeof VIEWS;

const columns: (ColDef<Row> | ColGroupDef<Row>)[] = [
  {
    headerName: "From PayPal",
    children: [
      {
        field: "date",
        headerName: "Date",
        sort: "desc",
        minWidth: 150,
        width: 135,
        valueFormatter: (p) =>
          pinned(p) || !p.value
            ? ""
            : new Date(p.value as string).toLocaleString(undefined, {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }),
      },
      {
        field: "transactionId",
        headerName: "Payment",
        minWidth: 175,
        width: 180,
        cellClass: "mono",
        cellStyle: (p) =>
          pinned(p) ? { fontWeight: 600, fontFamily: "inherit" } : null,
      },
      {
        field: "items",
        headerName: "Items",
        minWidth: 150,
        width: 175,
        tooltipField: "items",
        cellRenderer: (p: ICellRendererParams<Row, string>) =>
          pinned(p) ? (
            ""
          ) : p.value ? (
            p.value
          ) : (
            <span className="muted">Not sent by PayPal</span>
          ),
      },
      {
        field: "amount",
        headerName: "Amount",
        type: "numericColumn",
        minWidth: 120,
        width: 115,
        cellClass: "mono",
        valueFormatter: (p) => `USD ${Number(p.value ?? 0).toFixed(2)}`,
        cellStyle: (p) => (pinned(p) ? { fontWeight: 600 } : null),
      },
      {
        field: "protection",
        headerName: "Protection",
        headerTooltip:
          "PayPal's own flag on this payment, read from Transaction Search. Standing doesn't decide it.",
        minWidth: 120,
        width: 120,
        filterValueGetter: (p) =>
          p.data ? PROTECTION[p.data.protection].label : "",
        cellRenderer: (p: ICellRendererParams<Row, Protection>) => {
          if (pinned(p) || !p.value)
            return p.data?.pinned ? (
              <span className="muted small">{p.data.items}</span>
            ) : null;
          const { label, tone } = PROTECTION[p.value];
          return <Chip tone={tone}>{label}</Chip>;
        },
      },
      {
        field: "tracking",
        headerName: "Tracking / Completed",
        minWidth: 150,
        width: 175,
        cellRenderer: (p: ICellRendererParams<Row, string>) => {
          const r = p.data;
          if (!r || pinned(p))
            return r?.pinned ? (
              <span className="muted small">{r.tracking}</span>
            ) : null;
          if (r.trackingState === "missing")
            return <Chip tone="warn">Missing</Chip>;
          if (r.trackingState === "completed")
            return <Chip tone="ok">Completed</Chip>;
          if (r.trackingState === "tracked")
            return <span className="mono small">{r.tracking}</span>;
          return <span className="muted">—</span>;
        },
      },
    ],
  },
  {
    headerName: "Standing's view",
    children: [
      {
        field: "kind",
        headerName: "Kind",
        minWidth: 95,
        width: 105,
        valueFormatter: (p) => (pinned(p) ? "" : String(p.value ?? "")),
      },
      {
        field: "categories",
        headerName: "Category",
        minWidth: 110,
        hide: true,
      },
      {
        field: "evidence",
        headerName: "Evidence",
        headerTooltip:
          "Evidence items Standing has recorded for this order: the payment, tracking, invoice and so on.",
        type: "numericColumn",
        minWidth: 80,
        width: 100,
        cellStyle: (p) => (pinned(p) ? { fontWeight: 600 } : null),
      },
      {
        field: "fix",
        headerName: "Fix",
        minWidth: 95,
        width: 95,
        cellRenderer: (p: ICellRendererParams<Row, string | null>) =>
          pinned(p) ? null : p.value ? (
            <Chip tone={FIX_TONE[p.value] ?? "info"}>{p.value}</Chip>
          ) : (
            <span className="muted">—</span>
          ),
      },
    ],
  },
];

export default function OrdersPage() {
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "signed_out" | "error">(
    "loading",
  );
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("all");
  const [shown, setShown] = useState<OrderRow[]>([]);
  const [dark, setDark] = useState(false);
  const gridApi = useRef<GridApi<Row> | null>(null);
  const viewRef = useRef<View>("all");

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
      setShown(res.data.rows);
      setState("ok");
    });
    return () => {
      live = false;
    };
  }, []);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(VIEWS).map(([k, v]) => [
          k,
          rows?.filter(v.test).length ?? 0,
        ]),
      ) as Record<View, number>,
    [rows],
  );

  // Totals for whatever is on screen after filters, computed here and pinned under the table.
  const totals = useMemo<Row[]>(() => {
    if (!rows) return [];
    const cents = shown.reduce((s, r) => s + Math.round(r.amount * 100), 0);
    const missing = shown.filter((r) => r.trackingState === "missing").length;
    const unprotected = shown.filter(
      (r) => r.protection === "not eligible",
    ).length;
    return [
      {
        pinned: true,
        transactionId: `${shown.length} ${shown.length === 1 ? "order" : "orders"}`,
        date: "",
        amount: cents / 100,
        amountText: "",
        kind: "",
        categories: "",
        tracking: missing ? `${missing} missing` : "",
        trackingState: "none",
        evidence: shown.reduce((s, r) => s + r.evidence, 0),
        fix: null,
        items: `${unprotected} not eligible`,
        protection: "not stated",
      },
    ];
  }, [rows, shown]);

  const recount = useCallback(() => {
    const out: OrderRow[] = [];
    gridApi.current?.forEachNodeAfterFilter((n) => n.data && out.push(n.data));
    setShown(out);
  }, []);

  const pickView = (v: View) => {
    viewRef.current = v;
    setView(v);
    gridApi.current?.onFilterChanged();
  };

  const download = () =>
    gridApi.current?.exportDataAsCsv({
      fileName: `standing-orders-${new Date().toISOString().slice(0, 10)}.csv`,
      skipPinnedBottom: true,
      allColumns: true,
      processCellCallback: (p) => {
        const id = p.column.getColId();
        if (id === "protection")
          return PROTECTION[p.value as Protection]?.label ?? "";
        if (id === "amount") return Number(p.value).toFixed(2);
        return p.value == null ? "" : String(p.value);
      },
    });

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
  if (state === "error")
    return (
      <p className="error">
        Something went wrong loading your orders. Please refresh.
      </p>
    );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Orders</h1>
          <p className="muted small">
            PayPal payments from the last 90 days
            {rows ? ` · ${rows.length} orders` : ""}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "end",
            flexWrap: "wrap",
          }}
        >
          <label style={{ minWidth: "min(100%, 16rem)" }}>
            Search
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Payment ID, item, tracking…"
            />
          </label>
          <button
            type="button"
            className="secondary"
            onClick={download}
            disabled={!rows?.length}
          >
            Download CSV
          </button>
        </div>
      </div>

      <div
        role="group"
        aria-label="Quick views"
        style={{
          display: "flex",
          gap: "0.4rem",
          flexWrap: "wrap",
          marginBottom: "0.75rem",
        }}
      >
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <button
            key={v}
            type="button"
            className={view === v ? undefined : "secondary"}
            aria-pressed={view === v}
            onClick={() => pickView(v)}
            style={{ padding: "4px 12px", fontSize: "0.85rem" }}
          >
            {VIEWS[v].label} <span className="mono">{counts[v]}</span>
          </button>
        ))}
      </div>

      <div
        className="card"
        style={{
          padding: 0,
          height: "min(70vh, 640px)",
          width: "100%",
        }}
      >
        {rows ? (
          <AgGridReact<Row>
            theme={dark ? darkTheme : lightTheme}
            rowData={rows}
            columnDefs={columns}
            defaultColDef={{ sortable: true, filter: true, resizable: true }}
            quickFilterText={search}
            isExternalFilterPresent={() => viewRef.current !== "all"}
            doesExternalFilterPass={(n) =>
              n.data ? VIEWS[viewRef.current].test(n.data) : true
            }
            pinnedBottomRowData={totals}
            autoSizeStrategy={{ type: "fitGridWidth" }}
            onGridReady={(e) => {
              gridApi.current = e.api;
            }}
            onFilterChanged={recount}
            tooltipShowDelay={300}
            pagination
            paginationPageSize={25}
            paginationPageSizeSelector={[25, 50, 100]}
            overlayNoRowsTemplate="No PayPal payments match."
          />
        ) : (
          <p className="muted" style={{ padding: "1rem" }}>
            Loading…
          </p>
        )}
      </div>
      <p className="muted small" style={{ marginTop: "0.75rem" }}>
        <strong>Protection</strong> is PayPal&apos;s own flag on each payment,
        read from Transaction Search; Standing doesn&apos;t decide it, and it
        doesn&apos;t say how PayPal will rule in a dispute. &ldquo;Not in your
        catalogue&rdquo; means Standing can&apos;t tell physical from digital
        yet. <Link href="/catalogue">Add those products</Link>.
      </p>
    </>
  );
}
