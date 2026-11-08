import { useId, type ComponentProps, type ReactNode } from "react";

/** Label, control, hint and error, wired together for screen readers. The control gets id/aria props via render. */
export function Field({ label, hint, error, children }: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`ui-field${error ? " ui-field-invalid" : ""}`}>
      <label htmlFor={id} className="ui-label">
        {label}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && (
        <p id={hintId} className="ui-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="ui-error">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = ({ className, ...p }: ComponentProps<"input">) => <input className={["ui-input", className].filter(Boolean).join(" ")} {...p} />;
export const Select = ({ className, ...p }: ComponentProps<"select">) => <select className={["ui-input", "ui-select", className].filter(Boolean).join(" ")} {...p} />;
export const Textarea = ({ className, ...p }: ComponentProps<"textarea">) => <textarea className={["ui-input", "ui-textarea", className].filter(Boolean).join(" ")} {...p} />;

/** A checkbox with its label. `toggle` draws it as a switch (still a real checkbox underneath). */
export function Checkbox({ label, hint, toggle = false, ...p }: { label: ReactNode; hint?: ReactNode; toggle?: boolean } & Omit<ComponentProps<"input">, "type">) {
  return (
    <label className={`ui-check${toggle ? " ui-toggle" : ""}`}>
      <input type="checkbox" {...p} />
      {toggle && <span className="ui-toggle-track" aria-hidden="true" />}
      <span>
        <span className="ui-check-label">{label}</span>
        {hint && <span className="ui-hint ui-check-hint">{hint}</span>}
      </span>
    </label>
  );
}
