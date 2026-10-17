import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ComparisonBarChart, OrganisationTrend } from "../components/ComparisonCharts.jsx";
import { getComparisonSnapshot } from "../services/comparisonService.js";
import { isMockMode } from "../services/dataService.js";
import { CORE_METRICS, comparisonRows, organisationSummary, organisations, reportingPeriods } from "../utils/comparison.js";
import { displayUnit } from "../utils/display.js";

const format = (value) => Number(value).toLocaleString("en-MY", { maximumFractionDigits: 2 });
const MAX_VISIBLE_BUILDINGS = 6;

function MetricSelect({ id, value, onChange }) {
  return <label className="compare-field">Metric<select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
    {CORE_METRICS.map((metric) => <option key={metric.key} value={metric.key}>{metric.label} ({displayUnit(metric.unit)})</option>)}
  </select></label>;
}

export function ComparePage() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [view, setView] = useState("buildings");
  const [selectedIds, setSelectedIds] = useState([]);
  const [period, setPeriod] = useState("");
  const [metricKey, setMetricKey] = useState("electricity");
  const [organisation, setOrganisation] = useState("");
  const [orgMetricKey, setOrgMetricKey] = useState("electricity");
  const [sort, setSort] = useState("desc");

  useEffect(() => {
    let active = true;
    getComparisonSnapshot().then((data) => {
      if (!active) return;
      setSnapshot(data);
      const periods = reportingPeriods(data.submissions);
      setPeriod(periods.includes("2026-Q1") ? "2026-Q1" : periods.at(-1) || "");
      setSelectedIds(data.projects.slice(0, 3).map((project) => project.project_id));
      setOrganisation(organisations(data.projects)[0] || "");
    }).catch((cause) => { if (active) setError(cause.message || "Unable to load comparison data."); });
    return () => { active = false; };
  }, []);

  const projects = snapshot?.projects || [];
  const submissions = snapshot?.submissions || [];
  const periods = useMemo(() => reportingPeriods(submissions), [submissions]);
  const orgNames = useMemo(() => organisations(projects), [projects]);
  const rows = useMemo(() => comparisonRows(projects, submissions, selectedIds, period), [projects, submissions, selectedIds, period]);
  const metric = CORE_METRICS.find((item) => item.key === metricKey);
  const orgMetric = CORE_METRICS.find((item) => item.key === orgMetricKey);
  const available = rows.filter((row) => row.values[metricKey] !== null);
  const chartRows = available.map((row) => ({ id: row.project.project_id, name: row.project.project_name, value: row.values[metricKey] }));
  const ranked = [...chartRows].sort((a, b) => a.value - b.value);
  const summaries = CORE_METRICS.map((item) => ({ metric: item, result: organisationSummary(projects, submissions, organisation, period, item.key) }));
  const selectedSummary = summaries.find((item) => item.metric.key === orgMetricKey)?.result;
  const trend = periods.map((quarter) => organisationSummary(projects, submissions, organisation, quarter, orgMetricKey));

  function toggleBuilding(id) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < MAX_VISIBLE_BUILDINGS ? [...current, id] : current);
  }

  return <section className="page-panel compare-page">
    <div className="page-heading"><h1>Compare</h1></div>
    <p className="compare-intro">Compare reported building values and organisation totals from approved quarterly submissions.</p>
    {isMockMode ? <p className="compare-demo-label">Demo data · Fictional buildings and illustrative values</p> : null}
    <div className="compare-tabs" role="tablist" aria-label="Comparison view">
      <button type="button" role="tab" aria-selected={view === "buildings"} onClick={() => setView("buildings")}>Building Comparison</button>
      <button type="button" role="tab" aria-selected={view === "organisation"} onClick={() => setView("organisation")}>Organisation Performance</button>
    </div>
    {error ? <div className="error-message" role="alert">{error}</div> : null}
    {!snapshot && !error ? <p>Loading comparison data…</p> : null}
    {snapshot && <div role="tabpanel" className="compare-content">
      {view === "buildings" ? <>
        <div className="compare-toolbar">
          <label className="compare-field">Reporting quarter<select value={period} onChange={(event) => setPeriod(event.target.value)}>{periods.map((item) => <option key={item}>{item}</option>)}</select></label>
          <MetricSelect id="building-metric" value={metricKey} onChange={setMetricKey} />
          <label className="compare-field">Sort by<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="desc">Highest total</option><option value="asc">Lowest total</option></select></label>
        </div>
        <div className="compare-selector">
          <h2>Buildings <span>{selectedIds.length} selected</span></h2>
          <div className="compare-building-options">{projects.map((project) => <label key={project.project_id}>
            <input type="checkbox" checked={selectedIds.includes(project.project_id)} disabled={!selectedIds.includes(project.project_id) && selectedIds.length >= MAX_VISIBLE_BUILDINGS} onChange={() => toggleBuilding(project.project_id)} />
            <span>{project.project_name}<small>{project.organisation}</small></span>
          </label>)}</div>
          {selectedIds.length >= MAX_VISIBLE_BUILDINGS ? <p className="compare-note">Select up to {MAX_VISIBLE_BUILDINGS} buildings for a readable chart. Remove one to add another.</p> : null}
          <div className="compare-selected">{selectedIds.map((id) => {
            const project = projects.find((item) => item.project_id === id);
            return project ? <button type="button" key={id} onClick={() => toggleBuilding(id)} aria-label={`Remove ${project.project_name}`}>{project.project_name} <span aria-hidden="true">×</span></button> : null;
          })}</div>
        </div>
        <section className="compare-section" aria-labelledby="building-chart-heading"><h2 id="building-chart-heading">{metric.label} by building</h2>
          {!selectedIds.length ? <p className="comparison-empty">Select at least two buildings to compare.</p> : selectedIds.length === 1 ? <p className="comparison-empty">Select one more building for a comparison.</p> : <>
            <p className="compare-meta">{available.length} of {rows.length} selected buildings have approved {metric.label.toLowerCase()} data for {period}.</p>
            <ComparisonBarChart rows={chartRows} metric={metric} sort={sort} />
            {ranked.length > 1 ? <p className="compare-note">Highest reported total: <strong>{ranked.at(-1).name}</strong>. Lowest reported total: <strong>{ranked[0].name}</strong>. These are absolute values, not efficiency rankings.</p> : null}
          </>}
        </section>
        <section className="compare-section" aria-labelledby="building-table-heading"><h2 id="building-table-heading">Quarterly values</h2>
          {!rows.length ? <p>No buildings selected.</p> : <div className="compare-table-scroll"><table className="compare-table"><thead><tr><th>Building</th><th>Organisation</th><th>Quarter</th>{CORE_METRICS.map((item) => <th key={item.key}>{item.label} ({displayUnit(item.unit)})</th>)}<th>Approved source</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.project.project_id}><th><Link to={`/projects/${row.project.project_id}`}>{row.project.project_name}</Link></th><td>{row.project.organisation}</td><td>{period}</td>
              {CORE_METRICS.map((item) => <td key={item.key}>{row.values[item.key] === null ? <span className="missing-value">Missing</span> : format(row.values[item.key])}</td>)}
              <td>{row.submissionId ? <Link to={`/projects/${row.project.project_id}`}>Approved #{row.submissionId}</Link> : <span className="missing-value">No approved submission</span>}</td>
            </tr>)}</tbody></table></div>}
        </section>
      </> : <>
        <div className="compare-toolbar">
          <label className="compare-field">Organisation<select value={organisation} onChange={(event) => setOrganisation(event.target.value)}>{orgNames.map((name) => <option key={name}>{name}</option>)}</select></label>
          <label className="compare-field">Reporting quarter<select value={period} onChange={(event) => setPeriod(event.target.value)}>{periods.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <div className="compare-org-heading"><h2>{organisation}</h2><p>{selectedSummary?.buildingCount || 0} buildings · {selectedSummary?.contributorCount || 0} with approved {orgMetric.label.toLowerCase()} data · {period}</p></div>
        <div className="compare-kpis">{summaries.map(({ metric: item, result }) => <section key={item.key} className="compare-kpi">
          <h3>Total {item.label.toLowerCase()}</h3><strong>{result.total === null ? "Not available" : format(result.total)} {result.total === null ? "" : <small>{displayUnit(item.unit)}</small>}</strong>
          <p>{period} · {result.contributorCount} of {result.buildingCount} buildings reporting</p>
          <p>{result.matchedChangePercent === null ? "Previous-quarter comparison: Not available" : `Matched-building change vs ${result.previousPeriod}: ${result.matchedChangePercent > 0 ? "+" : ""}${result.matchedChangePercent.toFixed(1)}% (${result.matchedCount} ${result.matchedCount === 1 ? "building" : "buildings"})`}</p>
        </section>)}</div>
        <section className="compare-section" aria-labelledby="org-trend-heading"><div className="compare-section-head"><h2 id="org-trend-heading">Quarterly reported totals</h2><MetricSelect id="org-metric" value={orgMetricKey} onChange={setOrgMetricKey} /></div>
          <OrganisationTrend points={trend} metric={orgMetric} />
        </section>
        <section className="compare-section" aria-labelledby="contribution-heading"><h2 id="contribution-heading">Building contribution · {period}</h2>
          <p className="compare-meta">{selectedSummary.contributorCount} of {selectedSummary.buildingCount} buildings have approved {orgMetric.label.toLowerCase()} data for {period}.</p>
          {selectedSummary.contributorCount < selectedSummary.buildingCount ? <p className="compare-coverage">Reported total based on available approved submissions. Some buildings have missing data.</p> : null}
          <ComparisonBarChart metric={orgMetric} showShare rows={selectedSummary.contributors.map((row) => ({ id: row.project.project_id, name: row.project.project_name, value: row.values[orgMetricKey], share: row.share }))} />
        </section>
      </>}
      <p className="compare-method">Only the latest approved submission per building and quarter is counted. Missing values are excluded, never treated as zero. Reported totals may not represent a complete organisational footprint.</p>
    </div>}
  </section>;
}
