"use client";

// Small fetch helper for the seller screens: same-origin JSON, session cookie included.
export async function api<T>(path: string, init?: RequestInit): Promise<{ status: number; data: T | null }> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers }, cache: "no-store" });
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {}
  return { status: res.status, data };
}

export const usd = (cents: number) => `USD ${(cents / 100).toFixed(2)}`;
export const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
export const time = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
// Round ratios down so the screen never overstates (same rule as the alerts).
export const times = (r: number) => `${(Math.floor(r * 10) / 10).toFixed(1)}×`;
export const pct = (r: number) => `${Math.floor(r * 100)}%`;
