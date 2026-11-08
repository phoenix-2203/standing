import type { ReactNode } from "react";
import type { Tone } from "./Badge";

/** One figure with its label, a one-line meaning and an optional note (e.g. the threshold). */
export function StatTile({ label, figure, sub, note, tone, badge }: { label: ReactNode; figure: ReactNode; sub?: ReactNode; note?: ReactNode; tone?: Tone; badge?: ReactNode }) {
  return (
    <div className={`ui-stat${tone ? ` ui-stat-${tone}` : ""}`}>
      <div className="ui-stat-top">
        <span className="ui-stat-label">{label}</span>
        {badge}
      </div>
      <div className="ui-stat-figure">{figure}</div>
      {sub && <div className="ui-stat-sub">{sub}</div>}
      {note && <div className="ui-stat-note">{note}</div>}
    </div>
  );
}
