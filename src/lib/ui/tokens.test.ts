import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The colour tokens in globals.css must pass WCAG 2.2 AA in both themes. Reads the real file, so a token edit
// that breaks contrast fails here.
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function block(selectorStart: number): Record<string, string> {
  const open = css.indexOf("{", selectorStart);
  let depth = 0;
  let i = open;
  for (; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) break;
  }
  const body = css.slice(open + 1, i);
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2].toLowerCase()]));
}

const light = block(css.indexOf(":root {"));
const darkAt = css.indexOf("@media (prefers-color-scheme: dark)");
const dark = { ...light, ...block(css.indexOf(":root", darkAt)) };

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [text, background, minimum]: 4.5 for text, 3 for focus rings and borders that carry meaning.
const PAIRS: [string, string, number][] = [
  ["ink", "bg", 4.5],
  ["ink", "surface", 4.5],
  ["ink", "raised", 4.5],
  ["muted", "bg", 4.5],
  ["muted", "surface", 4.5],
  ["muted", "raised", 4.5],
  ["accent", "bg", 4.5],
  ["accent", "surface", 4.5],
  ["accent", "accent-bg", 4.5],
  ["accent-ink", "accent", 4.5],
  ["accent-ink", "accent-hover", 4.5], // primary button on hover
  ["accent", "raised", 4.5],
  ["ink", "highlight-bg", 4.5],
  ["warn", "highlight-bg", 4.5],
  ["surface", "bad", 4.5], // danger button text
  ["ok", "ok-bg", 4.5],
  ["warn", "warn-bg", 4.5],
  ["bad", "bad-bg", 4.5],
  ["info", "info-bg", 4.5],
  ["ok", "surface", 4.5],
  ["warn", "surface", 4.5],
  ["bad", "surface", 4.5],
  ["info", "surface", 4.5],
  ["focus", "bg", 3],
  ["focus", "surface", 3],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme tokens", (_name, t) => {
  it.each(PAIRS)("%s on %s ≥ %s:1", (fg, bg, min) => {
    expect(t[fg], `--${fg} missing`).toBeDefined();
    expect(t[bg], `--${bg} missing`).toBeDefined();
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });
});

// Marigold is decoration only (underlines, a glow, the active tab marker): it fails text contrast by design, so no
// stylesheet may use it as a text colour.
describe("highlight is never text", () => {
  it.each(["globals.css", "ui.css", "site.css", "app.css"])("%s", (file) => {
    const sheet = readFileSync(new URL(`../../app/${file}`, import.meta.url), "utf8");
    expect(sheet).not.toMatch(/(^|[^-])color:\s*var\(--highlight\)/m);
  });
});
