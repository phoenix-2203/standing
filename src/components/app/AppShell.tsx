"use client";

import {
  BookOpenCheck,
  CircleHelp,
  LifeBuoy,
  Scale,
  FileText,
  FolderOpen,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MessageCircleQuestion,
  Package,
  Rocket,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { SandboxTag, ThemeSwitch } from "@/components/ui";
import { api } from "@/lib/ui/client";
import { dateTime, relative } from "@/lib/ui/format";

type Item = { href: string; label: string; icon: LucideIcon; match?: string };
export const NAV: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: Package },
  { href: "/evidence", label: "Evidence", icon: FolderOpen },
  { href: "/packs", label: "Packs", icon: FileText },
  {
    href: "/dashboard#launch-h",
    label: "Launch plan",
    icon: Rocket,
    match: "-",
  },
  { href: "/disputes", label: "Disputes", icon: Scale },
  { href: "/held", label: "Money on hold", icon: LifeBuoy },
  { href: "/ask", label: "Ask Standing", icon: MessageCircleQuestion },
  { href: "/checklist", label: "Checklist", icon: ListChecks },
  { href: "/catalogue", label: "Catalogue", icon: BookOpenCheck },
  { href: "/guide", label: "Guide", icon: CircleHelp },
];

/** The seller app's frame: a sidebar on desktop, a top bar with a menu sheet on phones. Sandbox is always shown. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <a href="#app-main" className="skip-link">
        Skip to content
      </a>
      <aside className="app-side" aria-label="Standing">
        <Brand />
        <Suspense fallback={<NavList path="" />}>
          <CurrentNav />
        </Suspense>
        <div className="app-side-foot">
          <ThemeSwitch />
          <AccountChip />
          <SandboxTag />
        </div>
      </aside>
      <MobileBar />
      <main id="app-main" className="app-main" tabIndex={-1}>
        <DemoBanner />
        {children}
      </main>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="brand app-brand">
      <Logo size={26} />
      Standing
    </Link>
  );
}

function CurrentNav({ onNavigate }: { onNavigate?: () => void }) {
  return <NavList path={usePathname() ?? ""} onNavigate={onNavigate} />;
}

function NavList({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Main" className="app-nav">
      <ul>
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const base = match ?? href;
          const here = path === base || path.startsWith(`${base}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={here ? "page" : undefined}
                onClick={onNavigate}
              >
                <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

type Demo = { expiresAt: string; asksLeft: number; packsLeft: number } | null;

const BANNER_KEY = "standing-demo-banner";
const readCollapsed = () => {
  try {
    return typeof window !== "undefined" && sessionStorage.getItem(BANNER_KEY) === "collapsed";
  } catch {
    return false;
  }
};
/** "13 Nov, 07:21": when the demo copy is deleted. */
const shortDate = (iso: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")} ${get("month")}, ${get("hour")}:${get("minute")}`;
};

/** In a demo workspace: one slim line on every page saying what it is, that sends are simulated, what's left and
 * when it resets. It collapses to a "Demo" chip for this browser session; the chip expands it again. */
function DemoBanner() {
  const [demo, setDemo] = useState<Demo>(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  useEffect(() => {
    let live = true;
    void api<{ demo: Demo }>("/api/dashboard").then((r) => live && r.status === 200 && setDemo(r.data?.demo ?? null));
    return () => {
      live = false;
    };
  }, []);
  const toggle = (next: boolean) => {
    setCollapsed(next);
    try {
      if (next) sessionStorage.setItem(BANNER_KEY, "collapsed");
      else sessionStorage.removeItem(BANNER_KEY);
    } catch {
      // Storage blocked: it still collapses for this page.
    }
  };
  if (!demo) return null;
  if (collapsed) {
    return (
      <button type="button" className="demo-chip" onClick={() => toggle(false)} aria-expanded="false" title="Demo workspace: sends are simulated. Show details">
        <span className="demo-dot" aria-hidden="true" />
        Demo
      </button>
    );
  }
  return (
    <div className="demo-banner" role="note" aria-label="Demo workspace">
      <span className="demo-dot" aria-hidden="true" />
      <p className="demo-text">
        <strong>Demo:</strong> your own copy · sends are simulated · {demo.asksLeft} questions, {demo.packsLeft} AI builds left · resets{" "}
        {shortDate(demo.expiresAt)}
      </p>
      <span className="demo-links">
        <Link href="/guide#demo">What&apos;s this?</Link>
        <a href="/api/auth/paypal/start">Use your own PayPal</a>
      </span>
      <button type="button" className="demo-close" onClick={() => toggle(true)} aria-label="Collapse the demo banner" aria-expanded="true">
        <X size={14} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}

type Account = {
  demo?: Demo;
  verification: { state: string; title: string };
  sync: { lastRunAt: string | null; ok: boolean }[];
};

/** Which PayPal account, whether PayPal reports it verified, and when Standing last synced. */
function AccountChip() {
  const [acc, setAcc] = useState<Account | null>(null);
  useEffect(() => {
    let live = true;
    void api<Account>("/api/dashboard").then(
      (r) => live && r.status === 200 && r.data && setAcc(r.data),
    );
    return () => {
      live = false;
    };
  }, []);
  if (!acc) return null;
  const last = acc.sync
    .map((s) => s.lastRunAt)
    .filter((x): x is string => !!x)
    .sort()
    .at(-1);
  const v = acc.verification.state;
  return (
    <div className="account">
      <Link href="/checklist" className="account-chip">
        <span className="account-name">{acc.demo ? "Demo shop (your copy)" : "PayPal sandbox account"}</span>
        <span
          className={`ui-badge ui-badge-${v === "done" ? "ok" : v === "unknown" ? "info" : "warn"}`}
        >
          {v === "done"
            ? "verified"
            : v === "unknown"
              ? "status unknown"
              : "unverified"}
        </span>
        <span
          className="account-sync"
          title={last ? relative(last) : undefined}
        >
          {last ? `Synced ${dateTime(last)}` : "Not synced yet"}
          {acc.sync.some((s) => !s.ok) && " · last sync had a problem"}
        </span>
      </Link>
      {/* A plain form POST: it works without JavaScript and the server clears the session cookie. */}
      <form method="post" action="/api/auth/logout" className="account-logout">
        <button type="submit" className="ui-btn ui-btn-ghost ui-btn-sm">
          <LogOut size={14} strokeWidth={1.75} aria-hidden="true" />
          <span>Log out</span>
        </button>
      </form>
    </div>
  );
}

/** Phones: a top bar; the menu opens the same list as a sheet (a modal dialog, so Esc and focus work). */
function MobileBar() {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <header className="app-top">
      <Brand />
      <SandboxTag compact />
      <button
        type="button"
        className="ui-icon-btn app-menu-btn"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <dialog
        ref={ref}
        className="app-sheet"
        aria-label="Menu"
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === ref.current && setOpen(false)}
      >
        <div className="app-sheet-head">
          <Brand />
          <button
            type="button"
            className="ui-icon-btn"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            <X size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <Suspense fallback={<NavList path="" />}>
          <CurrentNav onNavigate={() => setOpen(false)} />
        </Suspense>
        <div className="app-side-foot">
          <ThemeSwitch />
          <AccountChip />
          <SandboxTag />
        </div>
      </dialog>
    </header>
  );
}
