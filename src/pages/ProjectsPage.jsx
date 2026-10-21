import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { getProjectCatalogue } from "../services/dataService.js";
import { displayDate } from "../utils/display.js";

const STATUS_OPTIONS = ["APPROVED", "UNREVIEWED", "REJECTED"];
const SORT_OPTIONS = [
  { value: "updated_desc", label: "Newest update" },
  { value: "updated_asc", label: "Oldest update" },
  { value: "project_name_asc", label: "Project A-Z" },
  { value: "project_name_desc", label: "Project Z-A" },
  { value: "organisation_asc", label: "Organisation A-Z" },
  { value: "organisation_desc", label: "Organisation Z-A" },
  { value: "created_desc", label: "Newest project" },
  { value: "created_asc", label: "Oldest project" },
  { value: "period_desc", label: "Latest period" },
  { value: "period_asc", label: "Earliest period" },
];
// Approved and unreviewed by default; rejected only when ticked.
const DEFAULT_STATUSES = ["APPROVED", "UNREVIEWED"];
const DEFAULT_PAGE_SIZE = 12;

function splitStatuses(value) {
  if (!value) {
    return DEFAULT_STATUSES;
  }
  const statuses = value
    .split(",")
    .map((status) => status.trim().toUpperCase())
    .filter(Boolean);
  return statuses.length ? statuses : DEFAULT_STATUSES;
}

function getPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function statusClass(status) {
  return `status-pill status-${status.toLowerCase()}`;
}

function optionLabel(option) {
  return `${option.value} (${option.count})`;
}

export function ProjectsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(
    () => ({
      search: searchParams.get("search") || "",
      location: searchParams.get("location") || "",
      organisation: searchParams.get("organisation") || "",
      reporting_period: searchParams.get("reporting_period") || "",
      status: splitStatuses(searchParams.get("status")),
      sort: searchParams.get("sort") || "updated_desc",
      page: getPositiveInt(searchParams.get("page"), 1),
      page_size: getPositiveInt(searchParams.get("page_size"), DEFAULT_PAGE_SIZE),
    }),
    [searchParams],
  );
  const [catalogue, setCatalogue] = useState({
    projects: [],
    page: 1,
    page_size: DEFAULT_PAGE_SIZE,
    total_items: 0,
    total_pages: 0,
    filters: { organisations: [], locations: [], statuses: [], reporting_periods: [] },
  });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setStatus("loading");
    setError("");

    getProjectCatalogue({
      search: query.search,
      location: query.location,
      organisation: query.organisation,
      reporting_period: query.reporting_period,
      status: query.status,
      sort: query.sort,
      page: query.page,
      page_size: query.page_size,
    })
      .then((data) => {
        if (!isMounted) {
          return;
        }
        setCatalogue(data);
        setStatus("success");
      })
      .catch((err) => {
        if (!isMounted) {
          return;
        }
        setError(err.message || "Unable to load projects.");
        setStatus("error");
      });

    return () => {
      isMounted = false;
    };
  }, [query.location, query.organisation, query.page, query.page_size, query.reporting_period, query.search, query.sort, query.status]);

  function updateQuery(updates) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === "" || value === null || value === undefined) {
        next.delete(key);
      } else if (Array.isArray(value)) {
        if (value.length === 0 || value.join(",") === DEFAULT_STATUSES.join(",")) {
          next.delete(key);
        } else {
          next.set(key, value.join(","));
        }
      } else {
        next.set(key, String(value));
      }
    }
    if (!Object.hasOwn(updates, "page")) {
      next.delete("page");
    }
    setSearchParams(next);
  }

  function toggleStatus(selectedStatus) {
    const current = new Set(query.status);
    if (current.has(selectedStatus)) {
      current.delete(selectedStatus);
    } else {
      current.add(selectedStatus);
    }
    updateQuery({ status: Array.from(current).length ? Array.from(current) : DEFAULT_STATUSES });
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams());
  }

  const projects = catalogue.projects || [];
  const filters = catalogue.filters || {};
  const totalPages = catalogue.total_pages || 0;
  const detailQuery = searchParams.toString();

  return (
    <section className="page-panel project-catalogue">
      <div className="page-heading">
        <h1>Projects</h1>
      </div>

      <div className="catalogue-filters">
      <div className="catalogue-toolbar" aria-label="Project catalogue filters">
        <label className="catalogue-field catalogue-search">
          <span>Search</span>
          <input
            type="search"
            value={query.search}
            onChange={(event) => updateQuery({ search: event.target.value })}
            placeholder="Project or organisation"
          />
        </label>

        <label className="catalogue-field">
          <span>Location</span>
          <select value={query.location} onChange={(event) => updateQuery({ location: event.target.value })}>
            <option value="">All locations</option>
            {(filters.locations || []).map((option) => (
              <option key={option.value} value={option.value}>
                {optionLabel(option)}
              </option>
            ))}
          </select>
        </label>

        <label className="catalogue-field">
          <span>Organisation</span>
          <select value={query.organisation} onChange={(event) => updateQuery({ organisation: event.target.value })}>
            <option value="">All organisations</option>
            {(filters.organisations || []).map((option) => (
              <option key={option.value} value={option.value}>
                {optionLabel(option)}
              </option>
            ))}
          </select>
        </label>

        <label className="catalogue-field">
          <span>Latest submitted period</span>
          <select
            value={query.reporting_period}
            onChange={(event) => updateQuery({ reporting_period: event.target.value })}
          >
            <option value="">All periods</option>
            {(filters.reporting_periods || []).map((option) => (
              <option key={option.value} value={option.value}>
                {optionLabel(option)}
              </option>
            ))}
          </select>
        </label>

        <label className="catalogue-field">
          <span>Sort</span>
          <select value={query.sort} onChange={(event) => updateQuery({ sort: event.target.value })}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="catalogue-status-row" aria-label="Latest submission decision filters">
        <span className="catalogue-status-label">Latest submission decision</span>
        {STATUS_OPTIONS.map((statusOption) => (
          <label key={statusOption} className="status-toggle">
            <input
              type="checkbox"
              checked={query.status.includes(statusOption)}
              onChange={() => toggleStatus(statusOption)}
            />
            <span className={statusClass(statusOption)}>{statusOption}</span>
          </label>
        ))}
        <button type="button" className="secondary-button catalogue-reset" onClick={clearFilters}>
          Reset
        </button>
      </div>
      </div>

      {status === "loading" && <p>Loading projects...</p>}
      {status === "error" && (
        <div className="form-error" role="status">
          {error}
        </div>
      )}
      {status === "success" && (
        <div className="catalogue-summary" role="status">
          <strong>Showing {projects.length} of {catalogue.total_items} project{catalogue.total_items === 1 ? "" : "s"}.</strong>{" "}
          <span>Status and period filters refer to the latest submission.</span>
        </div>
      )}
      {status === "success" && projects.length === 0 && <p>No projects match the selected filters.</p>}
      {status === "success" && projects.length > 0 && (
        <div className="project-list">
          <div className="project-list-head" aria-hidden="true"><span>Project / organisation</span><span>Location</span><span>Latest submitted period</span><span>Latest decision</span><span>Updated</span><span></span></div>
          {projects.map((project) => (
            <Link
              key={project.project_id}
              to={`/projects/${project.project_id}${detailQuery ? `?${detailQuery}` : ""}`}
              className="project-list-item"
            >
              <span className="project-list-identity"><strong>{project.project_name}</strong><small>{project.organisation}</small>{project.trusted_metric?.reporting_period && <small>Approved data: {project.trusted_metric.reporting_period}</small>}</span>
              <span className="project-list-location" title={project.location || undefined}>{project.location || "Not set"}</span>
              <span>{project.reporting_period || "Not available"}</span>
              <span className={statusClass(project.status)}>{project.status}</span>
              <span>{displayDate(project.updated_at)}</span>
              <span className="project-view-link">View project →</span>
            </Link>
          ))}
        </div>
      )}
      {status === "success" && totalPages > 1 && (
        <div className="pagination-controls" aria-label="Project catalogue pagination">
          <button
            type="button"
            className="secondary-button"
            disabled={query.page <= 1}
            onClick={() => updateQuery({ page: query.page - 1 })}
          >
            Previous
          </button>
          <span>
            Page {catalogue.page} of {totalPages}
          </span>
          <button
            type="button"
            className="secondary-button"
            disabled={query.page >= totalPages}
            onClick={() => updateQuery({ page: query.page + 1 })}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
