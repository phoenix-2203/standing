"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CopyId } from "./CopyId";

type ToastItem = { id: number; tone: "ok" | "bad" | "info"; title: string; detail?: string; paypalId?: { label: string; value: string } };
type Push = (t: Omit<ToastItem, "id">) => void;

const Ctx = createContext<Push>(() => {});

/** The result of an action, briefly, with PayPal's response ID when there is one. Announced politely. */
export function useToast() {
  return useContext(Ctx);
}

const ICON = { ok: CircleCheck, bad: CircleAlert, info: Info };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback<Push>((t) => setItems((xs) => [...xs.slice(-2), { ...t, id: Date.now() + Math.random() }]), []);
  const dismiss = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id));
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="ui-toasts" aria-live="polite" aria-relevant="additions">
        {items.map((t) => (
          <ToastView key={t.id} t={t} onDone={() => dismiss(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastView({ t, onDone }: { t: ToastItem; onDone: () => void }) {
  // Results with a PayPal ID stay until dismissed, so the ID can be copied; others leave after 6 s.
  useEffect(() => {
    if (t.paypalId || t.tone === "bad") return;
    const h = setTimeout(onDone, 6000);
    return () => clearTimeout(h);
  }, [t, onDone]);
  const Icon = ICON[t.tone];
  return (
    <div className={`ui-toast ui-toast-${t.tone}`} role={t.tone === "bad" ? "alert" : "status"}>
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      <div className="ui-toast-body">
        <p className="ui-toast-title">{t.title}</p>
        {t.detail && <p className="ui-toast-detail">{t.detail}</p>}
        {t.paypalId && (
          <p className="ui-toast-detail">
            {t.paypalId.label} <CopyId value={t.paypalId.value} />
          </p>
        )}
      </div>
      <button type="button" className="ui-icon-btn" onClick={onDone} aria-label="Dismiss">
        <X size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
