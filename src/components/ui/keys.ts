// Keyboard logic for the dialog and tabs, kept pure so it can be tested without a browser.

/** Tab inside a dialog: where focus goes next, wrapping at both ends. -1 means "nothing focused yet". */
export function trapIndex(current: number, count: number, shift: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return shift ? count - 1 : 0;
  return shift ? (current - 1 + count) % count : (current + 1) % count;
}

/** Arrow keys, Home and End in a tab list (WAI-ARIA tabs pattern). null = the key isn't ours. */
export function nextTab(current: number, count: number, key: string): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
