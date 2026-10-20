import {
  AGGREGATIONS, AGGREGATION_SUMMARY, UNIT_LABELS, candidateFor, needsOpening,
  risesSteadily, sampleValues, siblingColumns,
} from "../utils/mappingReview.js";

// One measurement in the review step: a single line when nothing needs the
// uploader, the full set of controls when something does.
//
// The controls are unchanged - same four questions, same values, same confirmed
// mapping sent to the backend. What changes is that they are not all on screen
// at once, and that the evidence for the hardest of them sits beside it.
export function MetricMappingRow({
  field, label, units, item, preview, options, allOptions, period,
  blocking, advisory, expanded, onToggle, onChange,
}) {
  const candidate = candidateFor(preview, item.worksheet, item.header_row);
  // Drawn from the unfiltered list: a date column holds dates, not numbers, so
  // the measurement filter would hide exactly the columns this picker needs.
  const periodOptions = allOptions.filter((option) => option.worksheet === item.worksheet
    && option.header_row === item.header_row && /date|month|period|year/i.test(option.header));
  const values = sampleValues(preview, item);
  const siblings = siblingColumns(preview, item);
  const needsAttention = blocking.length > 0;

  function selectColumn(value) {
    onChange(value
      ? { ...JSON.parse(value), period_column_ref: "", missing: false, ambiguous: false }
      : { worksheet: "", header: "", column_ref: "", period_column_ref: "", missing: true });
  }

  const summary = [item.source_unit, AGGREGATION_SUMMARY[item.aggregation || "MONTHLY"]]
    .filter(Boolean).join(" · ");

  return (
    <div className={`metric-row${needsAttention ? " metric-row-attention" : ""}`}>
      <div className="metric-row-head">
        <span className={`metric-state${needsAttention ? " metric-state-attention" : ""}`} aria-hidden="true">
          {needsAttention ? "!" : "✓"}
        </span>
        <div className="metric-row-identity">
          <h3 className="metric-row-title">{label}</h3>
          <p className="metric-row-source">
            {item.column_ref
              ? <>{item.worksheet} · {item.header} ({item.column_ref})</>
              : <em>No column chosen yet</em>}
          </p>
          {summary && !expanded && <p className="metric-row-summary">{summary}</p>}
        </div>
        <button type="button" className="metric-row-toggle" aria-expanded={expanded}
          aria-label={`${expanded ? "Done with" : "Edit"} ${label}`} onClick={onToggle}>
          {expanded ? "Done" : "Edit"}
        </button>
      </div>

      {expanded && <div className="metric-row-body">
        <div className="mapping-fields">
          <div className="mapping-field mapping-field-wide">
            <label htmlFor={`mapping-${field}`}>Which column holds this figure</label>
            <select id={`mapping-${field}`} value={item.column_ref ? JSON.stringify(
              options.find((option) => option.worksheet === item.worksheet
                && option.header_row === item.header_row && option.column_ref === item.column_ref) || "") : ""}
              onChange={(event) => selectColumn(event.target.value)}>
              <option value="">Select source column</option>
              {options.map((option) => <option key={`${option.worksheet}-${option.header_row}-${option.column_ref}`}
                value={JSON.stringify(option)}>{option.worksheet} · {option.header} ({option.column_ref})</option>)}
            </select>
          </div>
          <div className="mapping-field">
            <label htmlFor={`period-${field}`}>Date column on this worksheet</label>
            <select id={`period-${field}`} value={item.period_column_ref || ""}
              onChange={(event) => onChange({ period_column_ref: event.target.value })}>
              <option value="">Select date column</option>
              {periodOptions.map((option) => <option key={option.column_ref} value={option.column_ref}>
                {option.header} ({option.column_ref})</option>)}
            </select>
          </div>
          <div className="mapping-field">
            <label htmlFor={`unit-${field}`}>Source unit</label>
            <select id={`unit-${field}`} value={units.includes(item.source_unit) ? item.source_unit : ""}
              onChange={(event) => onChange({ source_unit: event.target.value, ambiguous: false })}>
              <option value="">Select source unit</option>
              {units.map((unit) => <option key={unit} value={unit}>{UNIT_LABELS[unit] || unit}</option>)}
            </select>
          </div>
          <div className="mapping-field mapping-field-wide">
            <label htmlFor={`aggregation-${field}`}>What the rows represent</label>
            <select id={`aggregation-${field}`} value={item.aggregation || "MONTHLY"}
              onChange={(event) => onChange({ aggregation: event.target.value, ambiguous: false })}>
              {AGGREGATIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </div>
        </div>

        {values.length > 0 && <p className="metric-evidence">
          <span className="metric-evidence-label">First values in this column</span>
          <span className="metric-evidence-values">{values.join("  →  ")}</span>
          {risesSteadily(values) && <span className="metric-evidence-note">
            These three only climb, which is what a meter does rather than a daily figure.
          </span>}
        </p>}

        {needsOpening(item) && <div className="mapping-field mapping-field-required">
          <label htmlFor={`opening-${field}`}>Meter reading before {period || "this quarter"}</label>
          <input id={`opening-${field}`} inputMode="decimal" placeholder="e.g. 23410"
            value={item.opening_reading ?? ""}
            onChange={(event) => onChange({ opening_reading: event.target.value })} />
          <span className="mapping-hint">
            The first month&apos;s usage is measured from this reading, so it cannot be worked out from the file alone.
          </span>
        </div>}

        {/* Raised against the one worksheet it applies to, rather than as a standing
            paragraph on every upload. */}
        {siblings.length > 0 && <p className="mapping-hint">
          {item.worksheet} also contains {siblings.map((column) => column.header).join(", ")}.
          Only the column above is counted — if one of these is a share of another, they must not be added together.
        </p>}

        {candidate && <details className="metric-evidence-more">
          <summary>Sample rows from {item.worksheet}</summary>
          <div className="metrics-table-wrap">
            <table className="metrics-table">
              <thead><tr>{candidate.columns.map((column) => <th key={column.column_ref}>
                {column.header} ({column.column_ref})</th>)}</tr></thead>
              <tbody>{candidate.sample_rows.map((row, rowIndex) => <tr key={rowIndex}>
                {candidate.columns.map((column) => <td key={column.column_ref}>
                  {row[[...column.column_ref].reduce((number, letter) => number * 26 + letter.charCodeAt(0) - 64, 0) - 1] || "—"}
                </td>)}</tr>)}</tbody>
            </table>
          </div>
        </details>}
      </div>}

      {!expanded && blocking.map((reason) => <p className="field-error" key={reason}>{reason}</p>)}
      {advisory.map((reason) => <p className="mapping-hint" key={reason}>{reason}</p>)}
    </div>
  );
}
