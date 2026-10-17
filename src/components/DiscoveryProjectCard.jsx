import { Link } from "react-router-dom";
import { displayDate, displayUnit } from "../utils/display.js";

function statusClass(status) {
  return `status-pill status-${status.toLowerCase()}`;
}

function formatMetric(metric) {
  if (!metric) {
    return "No approved data yet";
  }
  return `${metric.metric_name}: ${Number(metric.value).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })} ${displayUnit(metric.unit)}`;
}

export function DiscoveryProjectCard({ project, onToggleHighlight, isUpdating = false, showLatestDecision = true }) {
  const detailUrl = `/projects/${project.project_id}`;
  const starLabel = project.highlighted
    ? `Remove ${project.project_name} from Highlighted`
    : `Add ${project.project_name} to Highlighted`;

  return (
    <article className="discovery-card">
      <div className="discovery-card-actions">
        <button
          type="button"
          className={`star-button${project.highlighted ? " star-button-active" : ""}`}
          aria-pressed={project.highlighted}
          aria-label={starLabel}
          disabled={isUpdating}
          onClick={() => onToggleHighlight(project)}
        >
          {project.highlighted ? "★" : "☆"}
        </button>
      </div>
      <Link to={detailUrl} className="discovery-card-link">
        <div className="project-card-header">
          <h2>{project.project_name}</h2>
          {showLatestDecision && project.status && <span className="project-latest-decision"><small>Latest submission decision</small><span className={statusClass(project.status)}>{project.status}</span></span>}
        </div>
        <dl className="project-card-meta">
          <div>
            <dt>Organisation</dt>
            <dd>{project.organisation}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{project.location || "Not set"}</dd>
          </div>
          <div>
            <dt>Latest approved metric</dt>
            <dd>{formatMetric(project.trusted_metric)}</dd>
          </div>
          <div>
            <dt>Latest approved period</dt>
            <dd>{project.trusted_metric?.reporting_period || "Not available"}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{displayDate(project.updated_at)}</dd>
          </div>
        </dl>
      </Link>
    </article>
  );
}
