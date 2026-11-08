import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** What this is, why it's empty, and one next action. */
export function EmptyState({ icon: Icon, title, children, action }: { icon?: LucideIcon; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ui-empty">
      {Icon && (
        <span className="ui-empty-icon" aria-hidden="true">
          <Icon size={20} strokeWidth={1.75} />
        </span>
      )}
      <p className="ui-empty-title">{title}</p>
      {children && <p className="ui-empty-text">{children}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}
