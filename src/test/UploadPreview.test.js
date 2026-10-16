import { describe, expect, it } from "vitest";
import { parseCsv } from "../utils/uploadPreview.js";

describe("CSV preview", () => {
  it("parses quoted values and backend column aliases", () => {
    expect(parseCsv('Name,Amount,Units,Category\r\n"Electricity",12.5,kWh,"Meter, main"\r\n')).toEqual([
      { metric_name: "Electricity", value: 12.5, unit: "kWh", category: "Meter, main" },
    ]);
  });
  it("rejects missing required columns and non-finite numbers", () => {
    expect(() => parseCsv("metric,value\nWater,2")).toThrow(/Missing required column/);
    expect(() => parseCsv("metric_name,value,unit\nWater,NaN,m3")).toThrow(/finite/);
  });
  it("rejects malformed quoting and blank data", () => {
    expect(() => parseCsv('metric_name,value,unit\n"Water,2,m3')).toThrow(/unclosed/);
    expect(() => parseCsv("metric_name,value,unit\n")).toThrow(/no data rows/);
  });
});
