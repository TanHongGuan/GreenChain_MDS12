export const CORE_METRICS = [
  { key: "electricity", label: "Electricity", names: ["Electricity", "electricity_consumption"], unit: "kWh" },
  { key: "water", label: "Water", names: ["Water", "water_consumption"], unit: "m3" },
  { key: "co2", label: "CO₂ emissions", names: ["CO2e", "CO2 Emissions", "carbon_emissions"], unit: "tCO2e" },
];

export function metricDefinition(name) {
  return CORE_METRICS.find((item) => item.names.some((alias) => alias.toLowerCase() === String(name).toLowerCase()));
}

// Which review states a chart may draw. REJECTED is deliberately absent and is
// not offered as a choice: rejected data failed review, and plotting it beside
// approved figures would present it as evidence. The history endpoint does not
// return it either.
export const CHART_STATUS_FILTERS = [
  ["APPROVED", "Approved only"],
  ["UNREVIEWED", "Unreviewed only"],
  ["BOTH", "Approved and unreviewed"],
];

export function statusesFor(filter) {
  if (filter === "UNREVIEWED") return ["UNREVIEWED"];
  if (filter === "BOTH") return ["APPROVED", "UNREVIEWED"];
  return ["APPROVED"];
}

export function normalizedPoint(point, definition, statuses = ["APPROVED"]) {
  if (!point || !statuses.includes(point.status) || !Number.isFinite(Number(point.value))) return null;
  const unit = String(point.unit || "").toLowerCase();
  const expected = definition.unit.toLowerCase();
  const multiplier = definition.key === "co2" && unit === "kgco2e" ? 0.001 : unit === expected ? 1 : null;
  if (multiplier === null) return null;
  return { ...point, value: Number(point.value) * multiplier, unit: definition.unit, source_value: point.value, source_unit: point.unit };
}

export function approvedSeries(points, definition) {
  return seriesForStatuses(points, definition, ["APPROVED"]);
}

export function seriesForStatuses(points, definition, statuses) {
  return (points || []).map((point) => normalizedPoint(point, definition, statuses)).filter(Boolean)
    .sort((a, b) => a.reporting_period.localeCompare(b.reporting_period));
}

export function comparePeriods(first, second) {
  if (!first || !second || first.unit !== second.unit) return null;
  const absolute = second.value - first.value;
  return { absolute, percent: first.value === 0 ? null : (absolute / first.value) * 100 };
}
