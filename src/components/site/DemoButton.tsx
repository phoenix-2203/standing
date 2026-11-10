import type { ReactNode } from "react";
import type { ButtonSize } from "@/components/ui";

// "Try the demo": a form POST, so a link preview or a crawler can't create a demo workspace by following a link.
export function DemoButton({
  size = "md",
  icon,
  children = "Try the demo",
}: {
  size?: ButtonSize;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <form action="/api/demo/start" method="post" style={{ display: "inline" }}>
      <button type="submit" className={`ui-btn ui-btn-primary ui-btn-${size}`}>
        {icon}
        <span>{children}</span>
      </button>
    </form>
  );
}
