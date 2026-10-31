import { DAY, HOUR, type Kind, type Sale } from "@/lib/metrics/compute";

// Deterministic seeded sales for metric and alert tests. Not PayPal data; nothing here is random.

export const AS_OF = new Date("2026-11-03T12:00:00Z");

let n = 0;
export function sale(hoursAgo: number, dollars: number, extra: Partial<Sale> = {}): Sale {
  n += 1;
  return {
    id: `S${String(n).padStart(4, "0")}`,
    at: new Date(AS_OF.getTime() - hoursAgo * HOUR),
    cents: Math.round(dollars * 100),
    kind: "physical" as Kind,
    categories: ["candles"],
    hasTracking: true,
    completed: false,
    ...extra,
  };
}

/** `perDay` orders of `dollars` each, every day from `fromDay` to `toDay` days ago (inclusive), at noon−1h. */
export function steady(fromDay: number, toDay: number, perDay: number, dollars: number, extra: Partial<Sale> = {}): Sale[] {
  const out: Sale[] = [];
  for (let d = fromDay; d >= toDay; d--) for (let i = 0; i < perDay; i++) out.push(sale(d * 24 + 1 + i * 0.1, dollars, extra));
  return out;
}

export const daysAgo = (d: number) => new Date(AS_OF.getTime() - d * DAY);
