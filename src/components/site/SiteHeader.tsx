"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { ButtonLink, SandboxTag } from "@/components/ui";
import { LOGIN, REPO } from "@/lib/site/facts";

/** Header for the public pages: logo, three links, the demo button and the sandbox tag. Turns translucent with a blur once the page scrolls. */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className="site-header" data-scrolled={scrolled || undefined}>
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label="Standing, home">
          <Logo size={26} />
          Standing
        </Link>
        <nav className="site-nav" aria-label="Site">
          <Link href="/#how">How it works</Link>
          <Link href="/trust">Trust</Link>
          <a href={REPO}>GitHub</a>
        </nav>
        <div className="site-header-cta">
          <SandboxTag compact />
          <ButtonLink href={LOGIN} size="sm" prefetch={false}>
            Try the demo
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
