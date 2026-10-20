import { describe, expect, test } from "vitest";

import {
  attentionFields, duplicateLabels, measurementOptionKeys, needsOpening,
  reviewReasons, risesSteadily, sampleValues, siblingColumns,
} from "../utils/mappingReview.js";

const preview = {
  sheets: [
    {
      worksheet: "Electricity_Log",
      candidates: [{
        header_row: 1,
        columns: [
          { header: "Reading Date", column_ref: "A" },
          { header: "Main Incoming Grid (kWh)", column_ref: "B" },
          { header: "Level 01 Submeter (kWh)", column_ref: "C" },
          { header: "Remarks", column_ref: "D" },
        ],
        sample_rows: [
          ["01/01/2026", "1342.56", "334.26", "Main meter INCLUDES Level 01"],
          ["02/01/2026", "1391.02", "367.27", "Main meter INCLUDES Level 01"],
          ["03/01/2026", "777.95", "209.39", "Main meter INCLUDES Level 01"],
        ],
      }],
    },
    {
      worksheet: "Water_Readings",
      candidates: [{
        header_row: 1,
        columns: [
          { header: "Reading Date", column_ref: "A" },
          { header: "Water Meter - cumulative (m3)", column_ref: "B" },
        ],
        sample_rows: [
          ["2026-01-01", "23436.8"],
          ["2026-01-02", "23467.18"],
          ["2026-01-03", "23484.17"],
        ],
      }],
    },
  ],
};

const electricity = {
  field: "electricity_kwh", worksheet: "Electricity_Log", header_row: 1,
  header: "Main Incoming Grid (kWh)", column_ref: "B", period_column_ref: "A",
  source_unit: "kWh", aggregation: "SUM_DAILY",
};
const water = {
  field: "water_m3", worksheet: "Water_Readings", header_row: 1,
  header: "Water Meter - cumulative (m3)", column_ref: "B", period_column_ref: "A",
  source_unit: "m3", aggregation: "DIFFERENCE_CUMULATIVE",
};

describe("mapping review rules", () => {
  test("a column's first values are read from the sample rows", () => {
    expect(sampleValues(preview, electricity)).toEqual(["1342.56", "1391.02", "777.95"]);
    expect(sampleValues(preview, water)).toEqual(["23436.8", "23467.18", "23484.17"]);
  });

  test("only a steadily climbing run is described as climbing", () => {
    // The meter column rises; the daily column does not. The note only ever
    // describes the three values on screen, so three is the minimum it accepts.
    expect(risesSteadily(sampleValues(preview, water))).toBe(true);
    expect(risesSteadily(sampleValues(preview, electricity))).toBe(false);
    expect(risesSteadily(["1", "2"])).toBe(false);
    expect(risesSteadily(["1", "x", "3"])).toBe(false);
  });

  test("columns with no number in any sampled row are not offered as measurements", () => {
    const keys = measurementOptionKeys(preview);
    expect(keys.has("Electricity_Log|1|B")).toBe(true);
    expect(keys.has("Electricity_Log|1|C")).toBe(true);
    // The date column and the remarks column hold no numbers.
    expect(keys.has("Electricity_Log|1|A")).toBe(false);
    expect(keys.has("Electricity_Log|1|D")).toBe(false);
  });

  test("other numeric columns on the same worksheet are named, the date column is not", () => {
    expect(siblingColumns(preview, electricity).map((column) => column.header))
      .toEqual(["Level 01 Submeter (kWh)"]);
    // Water has nothing beside its meter, so no double-counting note is raised.
    expect(siblingColumns(preview, water)).toEqual([]);
  });

  test("a cumulative column needs an opening reading, a daily one does not", () => {
    expect(needsOpening(water)).toBe(true);
    expect(needsOpening({ ...water, opening_reading: "23410" })).toBe(false);
    expect(needsOpening({ ...water, opening_reading: "  " })).toBe(true);
    expect(needsOpening(electricity)).toBe(false);
  });

  test("blocking reasons are separated from advisory ones", () => {
    const complete = reviewReasons(electricity, { units: ["kWh", "MWh"] });
    expect(complete.blocking).toEqual([]);
    expect(complete.advisory).toEqual([]);

    const unsure = reviewReasons({ ...electricity, ambiguous: true }, { units: ["kWh", "MWh"] });
    expect(unsure.blocking).toEqual([]);
    expect(unsure.advisory).toHaveLength(1);

    const incomplete = reviewReasons({ ...water, source_unit: "" }, { units: ["m3", "L"], period: "2026-Q1" });
    expect(incomplete.blocking).toEqual([
      "Confirm the unit.",
      "Enter the meter reading from before 2026-Q1.",
    ]);
  });

  test("two metrics on one column each name the other", () => {
    const draft = [electricity, { ...water, worksheet: "Electricity_Log", column_ref: "B", header_row: 1 }];
    const fields = [["electricity_kwh", "Electricity", []], ["water_m3", "Water", []]];
    const labels = duplicateLabels(draft, fields);
    expect(labels.get("electricity_kwh")).toBe("Water");
    expect(labels.get("water_m3")).toBe("Electricity");
  });

  test("only rows that need a person start expanded", () => {
    const fields = [["electricity_kwh", "Electricity", ["kWh", "MWh"]], ["water_m3", "Water", ["m3", "L"]]];
    // Water is cumulative with no opening reading; electricity is settled.
    expect(attentionFields([electricity, water], { fields, period: "2026-Q1" })).toEqual(["water_m3"]);
    expect(attentionFields([electricity, { ...water, opening_reading: "23410" }], { fields })).toEqual([]);
  });
});
