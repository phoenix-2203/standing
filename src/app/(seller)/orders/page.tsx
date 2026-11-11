"use client";

import { BookOpen, Download } from "lucide-react";
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
import { Button, ButtonLink, Callout, PageHeader } from "@/components/ui";
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
// A fix's status in plain words (CLAUDE.md rule 5: preview → cancel window → send → PayPal's answer).
const FIX: Record<string, { label: string; tone: string }> = {
  preview: { label: "Preview", tone: "info" },
  scheduled: { label: "Scheduled", tone: "info" },
  sending: { label: "Sending", tone: "info" },
  sent: { label: "Sent", tone: "ok" },
  simulated: { label: "Simulated (SIMULATED-DEMO)", tone: "warn" },
  unknown: { label: "No answer yet", tone: "warn" },
  failed: { label: "Failed", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "" },
};
const KIND: Record<string, string> = { physical: "Physical", digital: "Digital", service: "Service", unclassified: "Not in catalogue" };
const kindLabel = (k: string) => KIND[k] ?? k;

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
  all: { label: "All orders", test: () => true },
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
        minWidth: 125,
        width: 135,
        valueFormatter: (p) =>
          pinned(p) || !p.value
            ? ""
            : new Date(p.value as string).toLocaleString(undefined, {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
              }),
      },
      {
        field: "transactionId",
        headerName: "Payment",
        headerTooltip: "PayPal's transaction ID for this payment.",
        minWidth: 160,
        width: 170,
        cellClass: "mono",
        cellStyle: (p) =>
          pinned(p) ? { fontWeight: 600, fontFamily: "inherit" } : null,
      },
      {
        field: "items",
        headerName: "Items",
        headerTooltip: "What the buyer paid for, as PayPal recorded it.",
        minWidth: 110,
        width: 165,
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
        width: 120,
        cellClass: "mono",
        valueFormatter: (p) => `USD ${Number(p.value ?? 0).toFixed(2)}`,
        cellStyle: (p) => (pinned(p) ? { fontWeight: 600 } : null),
      },
      {
        field: "protection",
        headerName: "Protection",
        headerTooltip:
          "PayPal's own Seller Protection flag on this payment, read from PayPal. Standing only shows it.",
        minWidth: 115,
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
        headerName: "Tracking",
        headerTooltip: "Proof of delivery: the tracking number sent to PayPal, or Completed for a digital order. A dash means nothing is due yet.",
        minWidth: 130,
        width: 160,
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
        headerTooltip: "Physical, digital or service, matched from your Catalogue. Not in catalogue means Standing can't tell yet.",
        minWidth: 150,
        width: 150,
        valueFormatter: (p) => (pinned(p) ? "" : kindLabel(String(p.value ?? ""))),
        filterValueGetter: (p) => (p.data ? kindLabel(p.data.kind) : ""),
        cellClass: (p) => (p.value === "unclassified" ? "muted" : ""),
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
          "How many records Standing keeps for this order (the payment, tracking, invoices, uploads) that a pack can cite.",
        type: "numericColumn",
        minWidth: 112,
        width: 112,
        cellStyle: (p) => (pinned(p) ? { fontWeight: 600 } : null),
      },
      {
        field: "fix",
        headerName: "Fix",
        headerTooltip: "A change Standing made in PayPal for this order, such as adding tracking, and where it stands. A dash means none was made.",
        minWidth: 105,
        width: 115,
        filterValueGetter: (p) => (p.data?.fix ? (FIX[p.data.fix]?.label ?? p.data.fix) : ""),
        cellRenderer: (p: ICellRendererParams<Row, string | null>) =>
          pinned(p) ? null : p.value ? (
            <Chip tone={FIX[p.value]?.tone ?? "info"}>{FIX[p.value]?.label ?? p.value}</Chip>
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
      <PageHeader
        title="Orders"
        description={`Every PayPal payment from the last 90 days, with what Standing knows about each one${rows ? ` · ${rows.length} orders` : ""}.`}
        action={
          <div className="orders-tools">
            <label htmlFor="orders-search" className="sr-only">
              Search orders
            </label>
            <input
              id="orders-search"
              className="ui-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search payment ID, item, tracking…"
            />
            <Button variant="secondary" onClick={download} disabled={!rows?.length} icon={<Download size={16} strokeWidth={1.75} aria-hidden="true" />}>
              Download CSV
            </Button>
          </div>
        }
      />

      {rows && counts.unclassified > 0 && counts.unclassified * 2 >= rows.length && (
        <Callout
          tone="info"
          title={`Standing doesn't know what you sold in ${counts.unclassified} of ${rows.length} orders`}
          action={
            <ButtonLink href="/catalogue" variant="secondary" size="sm" icon={<BookOpen size={14} strokeWidth={1.75} aria-hidden="true" />}>
              Add products
            </ButtonLink>
          }
        >
          Their items don&apos;t match any product in your Catalogue, so Kind shows &ldquo;Not in catalogue&rdquo; and Standing can&apos;t tell
          whether they ship. That&apos;s why their tracking shows a dash instead of &ldquo;Missing&rdquo;. Add your products and these columns fill in.
        </Callout>
      )}

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
      <ColumnKey />
    </>
  );
}

// What each column means and why a cell can be blank, in the seller's words.
function ColumnKey() {
  return (
    <details className="card orders-key" open>
      <summary>What each column means</summary>
      <dl>
        <div>
          <dt>Protection</dt>
          <dd>
            PayPal&apos;s own label for whether this payment qualifies for Seller Protection, which can cover you if a buyer says an
            item never arrived. Standing reads it from PayPal and never sets it, and it doesn&apos;t say how PayPal will rule in a
            dispute. <em>Not stated</em> means PayPal didn&apos;t include it.
          </dd>
        </div>
        <div>
          <dt>Tracking</dt>
          <dd>
            Proof the order was delivered. For a physical order, the tracking number PayPal has. For a digital order,{" "}
            <em>Completed</em> means it was marked delivered in PayPal. <em>Missing</em> means a physical order is over 48 hours old
            with no tracking; add it from the dashboard. A dash means nothing is due yet: the order is digital, under 48 hours old,
            or not in your catalogue.
          </dd>
        </div>
        <div>
          <dt>Kind</dt>
          <dd>
            Physical, Digital or Service, matched from the products in your Catalogue. It decides which orders need tracking.{" "}
            <em>Not in catalogue</em> means the item didn&apos;t match a product you&apos;ve added, so Standing can&apos;t check it yet.
          </dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>
            How many records Standing keeps for this order that an explanation pack can cite: the PayPal payment itself, plus any
            tracking, invoices or uploads. Every order has at least one, the payment.
          </dd>
        </div>
        <div>
          <dt>Fix</dt>
          <dd>
            A change Standing made in PayPal for this order, such as adding tracking, and where it stands: Preview, Scheduled,
            Sending, Sent, <em>Simulated</em> (a demo workspace: nothing went to PayPal), Failed, Cancelled or <em>No answer yet</em> (sent, but PayPal hasn&apos;t replied; never resent as new).
            A dash means no fix was made.
          </dd>
        </div>
        <div>
          <dt>Items</dt>
          <dd>
            What the buyer paid for, as PayPal recorded it. <em>Not sent by PayPal</em> means PayPal&apos;s record has no item names.
          </dd>
        </div>
      </dl>
    </details>
  );
}
