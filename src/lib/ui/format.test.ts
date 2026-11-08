import { describe, expect, it } from "vitest";
import { dateOnly, dateTime, money, moneyCents, ratio, relative, truncateMiddle } from "./format";

describe("format", () => {
  it("money shows the currency code and thousands separators", () => {
    expect(money(1234.5)).toBe("USD 1,234.50");
    expect(money(18)).toBe("USD 18.00");
    expect(moneyCents(3645)).toBe("USD 36.45");
    expect(money(5, "CAD")).toBe("CAD 5.00");
    expect(money(-12)).toBe("-USD 12.00");
  });

  it("dates read as '7 Nov 2026, 14:05' in the given zone", () => {
    const d = new Date("2026-11-07T13:05:00Z");
    expect(dateTime(d, "UTC")).toBe("7 Nov 2026, 13:05");
    expect(dateTime(d, "Africa/Lagos")).toBe("7 Nov 2026, 14:05");
    expect(dateTime("2026-11-07T00:09:00Z", "UTC")).toBe("7 Nov 2026, 00:09");
    expect(dateOnly(d, "UTC")).toBe("7 Nov 2026");
  });

  it("relative time for tooltips", () => {
    const now = new Date("2026-11-07T14:00:00Z");
    expect(relative(new Date("2026-11-07T11:00:00Z"), now)).toBe("3 hours ago");
    expect(relative(new Date("2026-11-07T13:59:30Z"), now)).toBe("just now");
    expect(relative(new Date("2026-11-06T14:00:00Z"), now)).toBe("yesterday");
    expect(relative(new Date("2026-11-07T14:02:00Z"), now)).toBe("in 2 minutes");
  });

  it("ratios round down to one decimal, never up", () => {
    expect(ratio(14.29)).toBe("14.2×");
    expect(ratio(2.99)).toBe("2.9×");
    expect(ratio(3)).toBe("3.0×");
    expect(ratio(0.3)).toBe("0.3×"); // floating-point 0.3*10 must not drop to 0.2
  });

  it("long IDs keep their start and end", () => {
    expect(truncateMiddle("9J412792NM8796058")).toBe("9J41279…796058");
    expect(truncateMiddle("9J412792NM8796058")).toHaveLength(14);
    expect(truncateMiddle("SHORT-ID")).toBe("SHORT-ID");
    expect(truncateMiddle("8278f731-23c8-4af3-b73b-213450fe90d8", 12)).toBe("8278f7…e90d8");
  });
});
