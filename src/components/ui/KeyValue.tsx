import type { ReactNode } from "react";

/** Label/value pairs, e.g. a pack's period, status and ID. */
export function KeyValue({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="ui-kv">
      {items.map((it, i) => (
        <div key={i} className="ui-kv-row">
          <dt>{it.label}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
