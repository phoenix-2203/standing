"use client";

import {
  BookOpenCheck,
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

/** In a demo workspace: say what it is, what's simulated and what's left, on every page. */
function DemoBanner() {
  const [demo, setDemo] = useState<Demo>(null);
  useEffect(() => {
    let live = true;
    void api<{ demo: Demo }>("/api/dashboard").then((r) => live && r.status === 200 && setDemo(r.data?.demo ?? null));
    return () => {
      live = false;
    };
  }, []);
  if (!demo) return null;
  return (
    <div className="demo-banner" role="note">
      <strong>Demo workspace.</strong> Your own copy of a PayPal sandbox shop: click anything, nothing you do affects anyone else. Sends to PayPal are
      simulated (marked SIMULATED). Order IDs and dates are shifted from the originals. {demo.asksLeft} questions and {demo.packsLeft} AI builds left; deleted{" "}
      {dateTime(demo.expiresAt)}. <a href="/api/auth/paypal/start">Use your own PayPal account</a>
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
