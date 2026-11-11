"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY } from "./theme-script";

// The seller's theme choice: "system" follows the OS; "light" and "dark" set data-theme on <html>.
// The same rule runs before first paint from THEME_SCRIPT in layout.tsx, so there's no flash.
export type ThemeChoice = "system" | "light" | "dark";
const EVENT = "standing-theme-change";

export function readTheme(): ThemeChoice {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage blocked (private mode): the choice still applies to this page.
  }
  if (choice === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", choice);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  // Another tab changed the choice: apply it here too.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== THEME_KEY) return;
    const t = readTheme();
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    onChange();
  };
  mq.addEventListener("change", onChange);
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    mq.removeEventListener("change", onChange);
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const isDark = () => {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "dark" || (t !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
};

/** The saved choice (system / light / dark). Updates live; "system" on the server. */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, readTheme, () => "system");
}

/** True when the page is showing the dark theme: an explicit choice, or the OS when none. Updates live. */
export function useDarkTheme(): boolean {
  return useSyncExternalStore(subscribe, isDark, () => false);
}
