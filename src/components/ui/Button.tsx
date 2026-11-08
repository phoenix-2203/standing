import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const cls = (variant: ButtonVariant, size: ButtonSize, extra?: string) => ["ui-btn", `ui-btn-${variant}`, `ui-btn-${size}`, extra].filter(Boolean).join(" ");

type Common = { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode };

/** A button. While `loading`, it is disabled, says so to screen readers and keeps its width. */
export function Button({ variant = "primary", size = "md", loading = false, icon, className, children, disabled, ...rest }: Common & { loading?: boolean } & ComponentProps<"button">) {
  return (
    <button className={cls(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="ui-spinner" aria-hidden="true" /> : icon}
      <span>{children}</span>
    </button>
  );
}

/** A link styled as a button, for navigation. */
export function ButtonLink({ variant = "primary", size = "md", icon, className, children, ...rest }: Common & ComponentProps<typeof Link>) {
  return (
    <Link className={cls(variant, size, className)} {...rest}>
      {icon}
      <span>{children}</span>
    </Link>
  );
}

/** A plain anchor styled as a button, for files and API routes the client router shouldn't handle (a PDF download). */
export function ButtonAnchor({ variant = "primary", size = "md", icon, className, children, ...rest }: Common & ComponentProps<"a">) {
  return (
    <a className={cls(variant, size, className)} {...rest}>
      {icon}
      <span>{children}</span>
    </a>
  );
}
