import { Check, Circle, Clock, X } from "lucide-react";
import type { ReactNode } from "react";

export type StepState = "done" | "current" | "upcoming" | "failed";
const ICON = { done: Check, current: Clock, upcoming: Circle, failed: X };

/** Steps in order, e.g. a fix: Preview → Waiting → Sent → PayPal's answer. */
export function Timeline({ steps, label }: { steps: { title: ReactNode; detail?: ReactNode; state: StepState; time?: ReactNode }[]; label?: string }) {
  return (
    <ol className="ui-timeline" aria-label={label}>
      {steps.map((s, i) => {
        const Icon = ICON[s.state];
        return (
          <li key={i} className={`ui-tl-step ui-tl-${s.state}`} aria-current={s.state === "current" ? "step" : undefined}>
            <span className="ui-tl-dot" aria-hidden="true">
              <Icon size={12} strokeWidth={2.25} />
            </span>
            <div className="ui-tl-body">
              <div className="ui-tl-title">
                {s.title}
                {s.time && <span className="ui-tl-time">{s.time}</span>}
              </div>
              {s.detail && <div className="ui-tl-detail">{s.detail}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
