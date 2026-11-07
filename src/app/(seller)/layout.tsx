import Link from "next/link";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/NavLinks";

// Shell for the seller's screens. Every screen says it's sandbox data (CLAUDE.md rule 8).
export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="shell-header">
        <div className="shell-header-inner">
          <Link href="/dashboard" className="brand">
            <Logo size={24} />
            Standing
          </Link>
          <NavLinks />
          <span className="sandbox-tag">Sandbox</span>
        </div>
      </header>
      <div className="page">{children}</div>
    </>
  );
}
