"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button";
import { FOCUSABLE, trapIndex } from "./keys";

/**
 * Asks before a destructive action. A native modal <dialog>: the page behind is inert, Esc cancels, focus starts on
 * Cancel (the safe choice), Tab stays inside, and focus returns to whatever opened it.
 */
export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = "Cancel", onConfirm, onCancel, busy = false, tone = "danger" }: {
  open: boolean;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  tone?: "danger" | "primary";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
      cancelRef.current?.focus();
    } else if (!open && d.open) {
      d.close();
      (opener.current as HTMLElement | null)?.focus?.();
    }
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== "Tab" || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const next = trapIndex(items.indexOf(document.activeElement as HTMLElement), items.length, e.shiftKey);
    if (next >= 0) {
      e.preventDefault();
      items[next].focus();
    }
  };

  return (
    <dialog
      ref={ref}
      className="ui-dialog"
      aria-labelledby="ui-dialog-title"
      onKeyDown={onKeyDown}
      onCancel={(e) => {
        e.preventDefault(); // Esc: let the parent decide, so state and the DOM agree
        if (!busy) onCancel();
      }}
    >
      <h2 id="ui-dialog-title" className="ui-dialog-title">
        {title}
      </h2>
      {children && <div className="ui-dialog-body">{children}</div>}
      <div className="ui-dialog-actions">
        <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant={tone} onClick={onConfirm} loading={busy}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
