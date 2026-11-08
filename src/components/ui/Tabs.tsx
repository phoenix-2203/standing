"use client";

import { useId, useRef, type ReactNode } from "react";
import { nextTab } from "./keys";

/**
 * A tab list (WAI-ARIA tabs): arrow keys move between tabs, Home/End jump, only the selected tab is in the Tab order.
 * Controlled: the parent keeps `value`. With `panel`, renders the selected panel too; without it, works as a filter bar.
 */
export function Tabs<T extends string>({ items, value, onChange, label, panel }: {
  items: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  panel?: ReactNode;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(0, items.findIndex((i) => i.value === value));
  return (
    <>
      <div className="ui-tabs" role="tablist" aria-label={label}>
        {items.map((it, i) => (
          <button
            key={it.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`${id}-tab-${i}`}
            aria-selected={i === current}
            aria-controls={panel ? `${id}-panel` : undefined}
            tabIndex={i === current ? 0 : -1}
            className="ui-tab"
            onClick={() => onChange(it.value)}
            onKeyDown={(e) => {
              const n = nextTab(i, items.length, e.key);
              if (n === null) return;
              e.preventDefault();
              onChange(items[n].value);
              refs.current[n]?.focus();
            }}
          >
            {it.label}
            {it.count !== undefined && <span className="ui-tab-count">{it.count}</span>}
          </button>
        ))}
      </div>
      {panel && (
        <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${current}`} tabIndex={0} className="ui-tabpanel">
          {panel}
        </div>
      )}
    </>
  );
}
