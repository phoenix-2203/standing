"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { truncateMiddle } from "@/lib/ui/format";

/** An ID in mono, cut in the middle when long, with a button that copies the full value. */
export function CopyId({ value, max = 14, label = "ID" }: { value: string; max?: number; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the full value is still in the title */
    }
  };
  return (
    <span className="ui-copyid">
      <code title={value}>{truncateMiddle(value, max)}</code>
      <button type="button" className="ui-icon-btn" onClick={copy} aria-label={copied ? `${label} copied` : `Copy ${label} ${value}`}>
        {copied ? <Check size={14} strokeWidth={2} aria-hidden="true" /> : <Copy size={14} strokeWidth={1.75} aria-hidden="true" />}
      </button>
    </span>
  );
}
