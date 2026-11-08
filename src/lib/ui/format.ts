// Display formatting used across the UI. Presentation only: these never feed a metric, an alert or a PayPal call,
// and the pack letter keeps its own code-rendered wording.

/** "USD 1,234.50": the currency code, never a symbol, so a USD and a CAD figure can't be confused. */
export function money(amount: number, currency = "USD"): string {
  const s = new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code" }).format(amount);
  return s.replace(/ /g, " ");
}

/** Cents to money(). */
export const moneyCents = (cents: number, currency = "USD") => money(cents / 100, currency);

/** "7 Nov 2026, 14:05". Pass a time zone for stable output on the server; the browser's own zone otherwise. */
export function dateTime(d: Date | string, timeZone?: string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")}`;
}

/** "7 Nov 2026". */
export function dateOnly(d: Date | string, timeZone?: string): string {
  return dateTime(d, timeZone).split(",")[0];
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 864e5],
  ["month", 30 * 864e5],
  ["week", 7 * 864e5],
  ["day", 864e5],
  ["hour", 36e5],
  ["minute", 6e4],
];

/** "3 hours ago", "in 2 minutes", "just now": for tooltips next to dateTime(). */
export function relative(d: Date | string, now: Date = new Date()): string {
  const diff = (typeof d === "string" ? new Date(d) : d).getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of UNITS) if (Math.abs(diff) >= ms) return rtf.format(Math.trunc(diff / ms), unit);
  return "just now";
}

/** "14.2×": rounded down to one decimal, so a ratio is never shown larger than it is. */
export function ratio(r: number): string {
  return `${(Math.floor(r * 10 + 1e-9) / 10).toFixed(1)}×`;
}

/** "9J4127…796058": the start and end of a long ID, for display next to a copy button holding the full ID. */
export function truncateMiddle(id: string, max = 14): string {
  if (id.length <= max) return id;
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  return `${id.slice(0, head)}…${id.slice(id.length - (keep - head))}`;
}
