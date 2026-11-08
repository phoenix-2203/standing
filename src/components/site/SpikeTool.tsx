"use client";

import { Activity, CircleCheck, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Field, Input } from "@/components/ui";
import { ratio } from "@/lib/ui/format";
import { checkSpike } from "@/lib/ui/spike-tool";

const num = (s: string) => (s.trim() === "" ? Number.NaN : Number(s.replace(/[$,\s]/g, "")));

/** "Would this spike stand out?": runs the dashboard's own metrics and rules in the browser. No AI, no PayPal call. */
export function SpikeTool() {
  const [normal, setNormal] = useState("120");
  const [today, setToday] = useState("480");
  const [largest, setLargest] = useState("");
  const result = useMemo(() => {
    const l = num(largest);
    return checkSpike({ normalDay: num(normal), today: num(today), largestOrder: Number.isFinite(l) && l > 0 ? l : null });
  }, [normal, today, largest]);

  return (
    <div className="spike">
      <form className="spike-form" onSubmit={(e) => e.preventDefault()} aria-describedby="spike-note">
        <Field label="A normal day's sales (USD)">
          {(p) => <Input {...p} inputMode="decimal" value={normal} onChange={(e) => setNormal(e.target.value)} />}
        </Field>
        <Field label="Today's sales (USD)">
          {(p) => <Input {...p} inputMode="decimal" value={today} onChange={(e) => setToday(e.target.value)} />}
        </Field>
        <Field label="Largest single order today (optional)" hint="Part of today's sales.">
          {(p) => <Input {...p} inputMode="decimal" value={largest} placeholder="e.g. 250" onChange={(e) => setLargest(e.target.value)} />}
        </Field>
      </form>

      <div className="spike-result" aria-live="polite">
        {!result ? (
          <p className="muted">Enter a normal day above zero and today&apos;s sales.</p>
        ) : (
          <>
            <div className="spike-figure">
              <Activity size={20} strokeWidth={1.75} aria-hidden="true" />
              <span className="mono">{ratio(result.ratio)}</span>
              <span className="muted">a normal day</span>
            </div>
            {result.signals.length === 0 ? (
              <p className="spike-verdict spike-ok">
                <CircleCheck size={18} strokeWidth={1.75} aria-hidden="true" />
                Standing wouldn&apos;t raise a signal for this.
              </p>
            ) : (
              <>
                <p className="spike-verdict spike-warn">
                  <TriangleAlert size={18} strokeWidth={1.75} aria-hidden="true" />
                  Standing would raise {result.signals.length === 1 ? "a signal" : `${result.signals.length} signals`}:
                </p>
                <ul className="spike-signals">
                  {result.signals.map((s) => (
                    <li key={s.kind}>
                      <strong>{s.title}.</strong> {s.message}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
        <p id="spike-note" className="spike-note">
          Standing&apos;s thresholds, not PayPal&apos;s. PayPal doesn&apos;t publish its own. The example seller has sold for 60 days, one order a
          day. Worked out in your browser by the same code as the dashboard; nothing is sent anywhere.
        </p>
      </div>
    </div>
  );
}
