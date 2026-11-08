import { FlaskConical } from "lucide-react";
import type { ReactNode } from "react";

export type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "accent";

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`ui-badge ui-badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

/** Marks test inputs everywhere they appear (CLAUDE.md rule 8). Same look on every screen. */
export function SimulatedBadge({ title = "Test input, not a real record" }: { title?: string }) {
  return (
    <span className="ui-badge ui-badge-simulated" title={title}>
      <FlaskConical size={12} strokeWidth={2} aria-hidden="true" />
      Simulated
    </span>
  );
}

/** Says the data comes from PayPal's sandbox, not live money. */
export function SandboxTag({ compact = false }: { compact?: boolean }) {
  return (
    <span className="ui-sandbox" title="PayPal sandbox: test money only">
      <span className="ui-sandbox-dot" aria-hidden="true" />
      {compact ? "Sandbox" : "Sandbox · test money"}
    </span>
  );
}
