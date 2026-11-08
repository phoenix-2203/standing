import type { ReactNode } from "react";

/** Page title, one line of description, and the page's one primary action. */
export function PageHeader({ title, description, action, eyebrow }: { title: ReactNode; description?: ReactNode; action?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="ui-page-header">
      <div>
        {eyebrow && <div className="ui-eyebrow">{eyebrow}</div>}
        <h1 className="ui-page-title">{title}</h1>
        {description && <p className="ui-page-desc">{description}</p>}
      </div>
      {action && <div className="ui-page-action">{action}</div>}
    </header>
  );
}
