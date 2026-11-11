"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { applyTheme, type ThemeChoice, useThemeChoice } from "@/lib/ui/theme";

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light theme", Icon: Sun },
  { value: "system", label: "Match my system", Icon: Monitor },
  { value: "dark", label: "Dark theme", Icon: Moon },
];

/** A small segmented control: light, system, dark. The choice is remembered on this device. */
export function ThemeSwitch({ className }: { className?: string }) {
  const choice = useThemeChoice();
  return (
    <div className={`theme-switch${className ? ` ${className}` : ""}`} role="radiogroup" aria-label="Theme">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          aria-label={label}
          title={label}
          className="theme-switch-opt"
          onClick={() => applyTheme(value)}
        >
          <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
