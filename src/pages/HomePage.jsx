import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { addHighlightedProject, getHomeDiscovery, getProjectDetail, removeHighlightedProject } from "../services/dataService.js";
import { DiscoveryProjectCard } from "../components/DiscoveryProjectCard.jsx";
import { displayDate, displayUnit } from "../utils/display.js";
import { CORE_METRICS, metricDefinition, normalizedPoint } from "../utils/metrics.js";

const METRICS = [
  ["electricity", "Electricity"],
  ["water", "Water"],
  ["co2", "CO2 emissions"],
];

function approvedMetric(detail, key) {
  const definition = CORE_METRICS.find((metric) => metric.key === key);
  const record = detail?.metrics?.find((metric) => metricDefinition(metric.metric_name)?.key === key)?.latest;
  if (!record) return { value: "No approved data", period: null };
  const normalized = normalizedPoint(record, definition) || record;
  return {
    value: `${Number(normalized.value).toLocaleString("en-MY", { maximumFractionDigits: 2 })} ${displayUnit(normalized.unit)}`,
    period: record.reporting_period,
  };
}

function updateProject(projects, updatedProject) {
  return projects.map((project) => (project.project_id === updatedProject.project_id ? updatedProject : project));
}

export function HomePage() {
  const [discovery, setDiscovery] = useState({
    recently_updated: [],
    featured: [],
    new_projects: [],
    featured_rule: "",
  });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [updatingProjectId, setUpdatingProjectId] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setStatus("loading");
    setError("");

    getHomeDiscovery()
      .then(async (payload) => {
        if (!isMounted) {
          return;
        }
        setDiscovery(payload);
        setStatus("success");
        const candidate = (payload.featured || []).find((item) => item.trusted_metric);
        if (candidate) {
          try {
            const detail = await getProjectDetail(candidate.project_id);
            if (isMounted) setPreview({ project: candidate, detail });
          } catch {
            if (isMounted) setPreview(null);
          }
        }
      })
      .catch((err) => {
        if (!isMounted) {
          return;
        }
        setError(err.message || "Unable to load discovery.");
        setStatus("error");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleToggleHighlight(project) {
    setUpdatingProjectId(project.project_id);
    setError("");
    try {
      const payload = project.highlighted
        ? await removeHighlightedProject(project.project_id)
        : await addHighlightedProject(project.project_id);
      const updatedProject = project.highlighted
        ? { ...project, highlighted: false }
        : payload.project;
      setDiscovery((current) => ({
        ...current,
        recently_updated: updateProject(current.recently_updated, updatedProject),
        featured: updateProject(current.featured, updatedProject),
        new_projects: updateProject(current.new_projects, updatedProject),
      }));
    } catch (err) {
      setError(err.message || "Unable to update highlighted project.");
    } finally {
      setUpdatingProjectId(null);
    }
  }

  return (
    <section className="page-panel home-discovery-page">
      <div className="page-heading">
        <h1>Home</h1>
      </div>

      {status === "loading" && <p>Loading discovery...</p>}
      {error && (
        <div className="form-error" role="status">
          {error}
        </div>
      )}
      {status === "success" && (
        <>
          <div className="home-intro">
            <div>
              <p className="eyebrow">Sustainability records</p>
              <h2>Project overview</h2>
            </div>
            <Link to="/projects" className="secondary-button">Browse projects</Link>
          </div>
          {discovery.summary && (
            <dl className="platform-summary" aria-label="Platform summary">
              {[
                ["Projects", discovery.summary.total_projects],
                ["Organisations", discovery.summary.total_organisations],
                ["Submissions", discovery.summary.total_submissions],
                ["Approved submissions", discovery.summary.approved_submissions],
                ["Pending submissions", discovery.summary.unreviewed_submissions],
              ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
          )}
          {discovery.activity?.length > 0 && (
            <section className="activity-section" aria-labelledby="activity-heading">
              <div className="section-title-row"><h2 id="activity-heading">Recent submissions</h2><Link to="/projects">View projects</Link></div>
              <div className="activity-table-scroll">
                <div className="activity-row activity-header" aria-hidden="true"><span>Project</span><span>Organisation</span><span>Period</span><span>Decision</span><span>Submitted</span></div>
                <div className="activity-list">
                  {discovery.activity.map((item) => (
                    <Link key={item.submission_id} to={`/projects/${item.project_id}`} className="activity-row">
                      <strong>{item.project_name}</strong><span>{item.organisation}</span><span>{item.reporting_period}</span>
                      <span className={`status-pill status-${item.status.toLowerCase()}`}>{item.status}</span>
                      <time dateTime={item.submitted_at}>{displayDate(item.submitted_at)}</time>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}
          {preview && <section className="home-metric-preview" aria-labelledby="preview-heading">
            <div className="section-title-row"><h2 id="preview-heading">Latest approved data</h2><Link to={`/projects/${preview.project.project_id}`}>{preview.project.project_name}</Link></div>
            <p>Values below belong to this project only, not the whole platform.</p>
            <dl>{METRICS.map(([key, label]) => {
              const metric = approvedMetric(preview.detail, key);
              return <div key={key}><dt>{label}</dt><dd>{metric.value}</dd>{metric.period && <small>Approved period: {metric.period}</small>}</div>;
            })}</dl>
          </section>}
          <section className="discovery-section" aria-labelledby="recent-heading">
            <div className="section-title-row"><h2 id="recent-heading">Recently updated projects</h2><Link to="/projects?sort=updated_desc">View all</Link></div>
            {(discovery.recently_updated || []).length === 0 ? <p>No projects to show.</p> : <div className="discovery-card-grid">{discovery.recently_updated.slice(0, 4).map((project) => <DiscoveryProjectCard key={project.project_id} project={project} isUpdating={updatingProjectId === project.project_id} onToggleHighlight={handleToggleHighlight} showLatestDecision={false} />)}</div>}
          </section>
        </>
      )}
    </section>
  );
}
