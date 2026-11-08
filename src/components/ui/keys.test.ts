import { describe, expect, it } from "vitest";
import { nextTab, trapIndex } from "./keys";

describe("ConfirmDialog focus trap", () => {
  it("Tab moves forward and wraps from the last control to the first", () => {
    expect(trapIndex(0, 2, false)).toBe(1);
    expect(trapIndex(1, 2, false)).toBe(0);
  });
  it("Shift+Tab moves back and wraps from the first control to the last", () => {
    expect(trapIndex(0, 2, true)).toBe(1);
    expect(trapIndex(1, 3, true)).toBe(0);
  });
  it("with nothing focused yet, Tab lands on the first control and Shift+Tab on the last", () => {
    expect(trapIndex(-1, 3, false)).toBe(0);
    expect(trapIndex(-1, 3, true)).toBe(2);
  });
  it("no controls: nowhere to go", () => {
    expect(trapIndex(0, 0, false)).toBe(-1);
  });
});

describe("Tabs keyboard", () => {
  it("arrows wrap, Home and End jump, other keys are ignored", () => {
    expect(nextTab(0, 4, "ArrowRight")).toBe(1);
    expect(nextTab(3, 4, "ArrowRight")).toBe(0);
    expect(nextTab(0, 4, "ArrowLeft")).toBe(3);
    expect(nextTab(2, 4, "Home")).toBe(0);
    expect(nextTab(1, 4, "End")).toBe(3);
    expect(nextTab(1, 4, "Enter")).toBeNull();
  });
});
