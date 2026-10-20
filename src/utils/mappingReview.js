// Rules for the mapping review step, kept out of the component so the decision
// "does this row still need the uploader?" can be read and tested on its own.
//
// The review is summary-first: a metric collapses to one line unless something
// about it needs a person. Everything here exists to answer that question.

// What the source rows represent. This is the one question the workbook cannot
// always answer for itself: daily consumption and cumulative meter readings look
// identical in a spreadsheet, and summing a cumulative meter is nonsense.
export const AGGREGATIONS = [
  ["MONTHLY", "One value per month already"],
  ["SUM_DAILY", "Daily usage — add the days up"],
  ["DIFFERENCE_CUMULATIVE", "Meter readings — use the rise between them"],
];

export const AGGREGATION_SUMMARY = {
  MONTHLY: "monthly totals",
  SUM_DAILY: "daily totals",
  DIFFERENCE_CUMULATIVE: "meter readings",
};

// The abbreviations are what the file uses and what the backend expects, so the
// stored value never changes - the spelled-out name is only what the uploader
// reads while choosing.
export const UNIT_LABELS = {
  kWh: "kWh (kilowatt-hours)",
  MWh: "MWh (megawatt-hours)",
  m3: "m³ (cubic metres)",
  L: "L (litres)",
  tCO2e: "tCO₂e (tonnes of CO₂ equivalent)",
  kgCO2e: "kgCO₂e (kilograms of CO₂ equivalent)",
};

export const MAPPING_FIELDS = [
  ["electricity_kwh", "Electricity", ["kWh", "MWh"]],
  ["water_m3", "Water", ["m3", "L"]],
  ["co2_tco2e", "CO₂ emissions", ["tCO2e", "kgCO2e"]],
];

// "B" -> 1. Sample rows arrive as flat arrays, so a column letter has to be
// turned back into a position to read one.
export function columnPosition(ref) {
  return [...String(ref || "")].reduce((number, letter) => number * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

export function looksNumeric(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "—") return false;
  return Number.isFinite(Number(text.replace(/,/g, "")));
}

export function candidateFor(preview, worksheet, headerRow) {
  return preview?.sheets
    .find((sheet) => sheet.worksheet === worksheet)?.candidates
    .find((candidate) => candidate.header_row === headerRow) || null;
}

// The first few values of the chosen column, shown beside the question they
// answer. Three climbing numbers are a meter; three that rise and fall are daily
// usage. That is the whole reason the evidence belongs next to the control.
export function sampleValues(preview, item) {
  const candidate = candidateFor(preview, item?.worksheet, item?.header_row);
  if (!candidate || !item?.column_ref) return [];
  const position = columnPosition(item.column_ref);
  return candidate.sample_rows.map((row) => row[position]).filter((value) => String(value ?? "").trim());
}

// Only describes the values on screen. With three samples this cannot establish
// that a column is cumulative, so it never says so - it reports what is visible
// and leaves the reading to the uploader.
export function risesSteadily(values) {
  const numbers = values.map((value) => Number(String(value).replace(/,/g, "")));
  if (numbers.length < 3 || numbers.some((number) => !Number.isFinite(number))) return false;
  return numbers.every((number, index) => index === 0 || number > numbers[index - 1]);
}

// A column that holds no number in any sampled row cannot be a measurement, so
// it is dropped from the picker by default. The uploader can always show the
// full list, and whatever is already selected is never hidden from them.
export function measurementRefs(candidate) {
  const refs = new Set();
  for (const column of candidate?.columns || []) {
    const position = columnPosition(column.column_ref);
    if (candidate.sample_rows.some((row) => looksNumeric(row[position]))) refs.add(column.column_ref);
  }
  return refs;
}

// Numeric columns on the same worksheet that this metric is not using. These are
// where double counting comes from - a main meter sitting beside its own
// submeters - so the warning is raised here and nowhere else.
export function siblingColumns(preview, item) {
  const candidate = candidateFor(preview, item?.worksheet, item?.header_row);
  if (!candidate) return [];
  const refs = measurementRefs(candidate);
  return candidate.columns.filter((column) => refs.has(column.column_ref)
    && column.column_ref !== item.column_ref
    && column.column_ref !== item.period_column_ref);
}

export function optionKey(option) {
  return `${option.worksheet}|${option.header_row}|${option.column_ref}`;
}

export function mappingOptionsFrom(preview) {
  return preview?.sheets.flatMap((sheet) => sheet.candidates.flatMap((candidate) =>
    candidate.columns.map((column) => ({ worksheet: sheet.worksheet, header_row: candidate.header_row, ...column })))) || [];
}

export function measurementOptionKeys(preview) {
  const keys = new Set();
  for (const sheet of preview?.sheets || []) {
    for (const candidate of sheet.candidates) {
      for (const ref of measurementRefs(candidate)) {
        keys.add(`${sheet.worksheet}|${candidate.header_row}|${ref}`);
      }
    }
  }
  return keys;
}

// Two metrics drawing on the same column is always a mistake - the backend
// refuses it - so each side names the other rather than reporting a bare clash.
export function duplicateLabels(draft, fields) {
  const labels = new Map();
  draft.forEach((item, index) => {
    if (!item.column_ref) return;
    const other = draft.find((candidate, position) => position !== index
      && optionKey(candidate) === optionKey(item));
    if (other) labels.set(item.field, (fields.find(([field]) => field === other.field) || [])[1] || other.field);
  });
  return labels;
}

export function needsOpening(item) {
  return item?.aggregation === "DIFFERENCE_CUMULATIVE"
    && !(String(item.opening_reading ?? "").trim() && Number.isFinite(Number(item.opening_reading)));
}

// Everything that still needs a person, in the order it appears in the row.
// `blocking` entries also hold the Continue button; `advisory` entries are worth
// reading but do not stop processing.
export function reviewReasons(item, { units = [], duplicateOf = "", period = "" } = {}) {
  const blocking = [];
  if (!item?.column_ref) blocking.push("Choose which column holds this figure.");
  if (!item?.period_column_ref) blocking.push("Choose the date column on that worksheet.");
  if (!units.includes(item?.source_unit)) blocking.push("Confirm the unit.");
  if (needsOpening(item)) {
    blocking.push(`Enter the meter reading from before ${period || "this quarter"}.`);
  }
  if (duplicateOf) blocking.push(`This column is already used for ${duplicateOf}.`);

  const advisory = [];
  if (item?.warning) advisory.push(item.warning);
  else if (item?.ambiguous || item?.missing) {
    advisory.push("The AI was unsure here — check this one against your file.");
  }
  return { blocking, advisory };
}


// Which rows should start open: anything the uploader has to answer, and
// anything the AI flagged as uncertain. Seeded once on arrival so a row never
// collapses out from under someone mid-edit.
export function attentionFields(draft, { fields = MAPPING_FIELDS, period = "" } = {}) {
  const duplicates = duplicateLabels(draft, fields);
  return draft.filter((item) => {
    const units = (fields.find(([field]) => field === item.field) || [])[2] || [];
    const { blocking, advisory } = reviewReasons(item, {
      units, duplicateOf: duplicates.get(item.field), period,
    });
    return blocking.length > 0 || advisory.length > 0;
  }).map((item) => item.field);
}
