import type { ReactNode } from "react";

/** A surface with an optional header (title, one-line description, action) and footer. */
export function Card({ title, description, action, footer, children, id, className, as: Tag = "section" }: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  id?: string;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <Tag className={["ui-card", className].filter(Boolean).join(" ")} id={id} aria-labelledby={title ? headingId : undefined}>
      {(title || action) && (
        <header className="ui-card-head">
          <div>
            {title && <h2 id={headingId} className="ui-card-title">{title}</h2>}
            {description && <p className="ui-card-desc">{description}</p>}
          </div>
          {action && <div className="ui-card-action">{action}</div>}
        </header>
      )}
      {children}
      {footer && <footer className="ui-card-foot">{footer}</footer>}
    </Tag>
  );
}
