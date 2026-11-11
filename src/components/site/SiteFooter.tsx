import Link from "next/link";
import { ThemeSwitch } from "@/components/ui";
import { REPO } from "@/lib/site/facts";

const BUILT = new Date().toISOString().slice(0, 10); // a static page, so this is the build date

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <nav aria-label="Footer" className="site-footer-links">
          <Link href="/guide">Guide</Link>
          <Link href="/trust">Trust</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href={REPO}>GitHub</a>
          <a href={`${REPO}/blob/main/LICENSE`}>MIT licence</a>
        </nav>
        <p>Not affiliated with PayPal. PayPal is a trademark of its owner. A hackathon project on PayPal&apos;s sandbox: test money only.</p>
        <div className="site-footer-row">
          <p className="site-built">Built {BUILT}</p>
          <ThemeSwitch />
        </div>
      </div>
    </footer>
  );
}
