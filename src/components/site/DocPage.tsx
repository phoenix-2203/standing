import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/** A plain reading page on the public site (trust, privacy, terms). */
export function DocPage({ title, lead, children }: { title: string; lead: ReactNode; children: ReactNode }) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="doc">
        <h1 className="display-sm">{title}</h1>
        <p className="section-lead">{lead}</p>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
