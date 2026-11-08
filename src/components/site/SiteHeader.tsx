import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ButtonLink, SandboxTag } from "@/components/ui";
import { LOGIN, REPO } from "@/lib/site/facts";

/** Header for the public pages: logo, three links, Connect PayPal, and the sandbox tag. */
export function SiteHeader() {
  return (
    <header className="site-header">
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
            Connect PayPal
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
