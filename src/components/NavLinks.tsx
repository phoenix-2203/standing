"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/dashboard", "Dashboard"],
  ["/orders", "Orders"],
  ["/catalogue", "Catalogue"],
  ["/evidence", "Evidence"],
  ["/packs", "Packs"],
  ["/checklist", "Checklist"],
] as const;

// The main menu, marking the page you're on (a pack's own page counts as Packs). The path streams in
// after prerendering, so the plain menu shows until it does.
export function NavLinks() {
  return (
    <Suspense fallback={<Menu path="" />}>
      <CurrentMenu />
    </Suspense>
  );
}

function CurrentMenu() {
  return <Menu path={usePathname() ?? ""} />;
}

function Menu({ path }: { path: string }) {
  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map(([href, label]) => {
        const here = path === href || path.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-current={here ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
