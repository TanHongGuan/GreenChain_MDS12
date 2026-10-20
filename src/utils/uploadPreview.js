const aliases = { metric: "metric_name", name: "metric_name", amount: "value", quantity: "value", units: "unit", unit_of_measure: "unit", uom: "unit", type: "category" };
const missing = new Set(["", "n/a", "na", "null", "none", "-"]);
const header = (value) => { const normalized = value.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""); return aliases[normalized] || normalized; };

function parseRows(text) {
  const rows = [], row = [];
  let cell = "", quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else if (!quoted && cell) throw new Error("Invalid CSV quoting.");
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(cell); if (row.some((value) => value.trim())) rows.push([...row]); row.length = 0; cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(cell); if (row.some((value) => value.trim())) rows.push(row);
  if (!rows.length) throw new Error("The file is empty.");
  return rows;
}

export function parseCsv(text) {
  const rows = parseRows(text);
  const columns = rows.shift().map(header);
  const absent = ["metric_name", "value", "unit"].filter((name) => !columns.includes(name));
  if (absent.length) throw new Error(`Missing required column(s): ${absent.join(", ")}.`);
  const results = rows.map((cells, index) => {
    if (cells.length !== columns.length) throw new Error(`Row ${index + 2} has the wrong number of columns.`);
    const item = Object.fromEntries(columns.map((name, column) => [name, cells[column]?.trim() || ""]));
    for (const name of ["metric_name", "value", "unit"]) if (missing.has(item[name].toLowerCase())) throw new Error(`Row ${index + 2}: ${name} is required.`);
    if (!Number.isFinite(Number(item.value))) throw new Error(`Row ${index + 2}: value must be a finite number.`);
    return { metric_name: item.metric_name, value: Number(item.value), unit: item.unit, category: item.category || null };
  });
  if (!results.length) throw new Error("The file has no data rows.");
  return results;
}

const monthlyFormats = [
  ["reporting_period", "electricity_kwh", "water_m3", "co2_tco2e"],
  ["Month", "Electricity (MWh)", "Water (Litres)", "Carbon (kgCO2e)"],
];

export function parseUploadCsv(text) {
  const rows = parseRows(text);
  const headings = rows[0].map((value) => value.trim());
  const format = monthlyFormats.find((columns) => columns.length === headings.length && columns.every((name, index) => name.toLowerCase() === headings[index].toLowerCase()));
  if (!format) return { kind: "legacy", rows: parseCsv(text) };
  const result = rows.slice(1).map((cells, index) => {
    if (cells.length !== 4) throw new Error(`Row ${index + 2} has the wrong number of columns.`);
    return Object.fromEntries(format.map((name, column) => [name, cells[column].trim()]));
  });
  if (!result.length) throw new Error("The file has no data rows.");
  return { kind: "monthly", rows: result, columns: format };
}

export function readTextFile(file) {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("File could not be read."));
    reader.readAsText(file);
  });
}
