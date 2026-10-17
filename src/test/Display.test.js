import { describe, expect, test } from "vitest";
import { displayDate, displayUnit } from "../utils/display.js";

describe("display formatting", () => {
  test("uses Malaysia time without changing ISO source data", () => {
    expect(displayDate("2026-04-08T09:00:00Z", true)).toBe("8 Apr 2026, 17:00");
    expect(displayDate(null)).toBe("Not available");
  });

  test("uses readable unit symbols without converting values", () => {
    expect(displayUnit("m3")).toBe("m³");
    expect(displayUnit("tCO2e")).toBe("tCO₂e");
    expect(displayUnit("kWh")).toBe("kWh");
  });
});
