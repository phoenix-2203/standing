import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

const ICON = { info: Info, warn: TriangleAlert, bad: CircleAlert };

/** A boxed message: info, warning or problem. Use `role="alert"` only for something that just happened. */
export function Callout({ tone = "info", title, children, action, live = false }: { tone?: "info" | "warn" | "bad"; title?: ReactNode; children?: ReactNode; action?: ReactNode; live?: boolean }) {
  const Icon = ICON[tone];
  return (
    <div className={`ui-callout ui-callout-${tone}`} role={live ? "alert" : undefined}>
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" className="ui-callout-icon" />
      <div className="ui-callout-body">
        {title && <p className="ui-callout-title">{title}</p>}
        {children && <div className="ui-callout-text">{children}</div>}
        {action && <div className="ui-callout-action">{action}</div>}
      </div>
    </div>
  );
}
