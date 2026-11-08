import { AppShell } from "@/components/app/AppShell";
import { ToastProvider } from "@/components/ui";

// Shell for the seller's screens. Every screen says it's sandbox data (CLAUDE.md rule 8).
export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AppShell>
        <div className="page app-page">{children}</div>
      </AppShell>
    </ToastProvider>
  );
}
