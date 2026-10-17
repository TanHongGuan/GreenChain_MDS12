const DATE_FORMATTER = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function displayDate(value, includeTime = false) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return (includeTime ? DATE_TIME_FORMATTER : DATE_FORMATTER).format(date);
}

export function displayUnit(unit) {
  if (unit === "m3") return "m³";
  if (unit === "tCO2e") return "tCO₂e";
  if (unit === "kgCO2e") return "kgCO₂e";
  return unit || "";
}
