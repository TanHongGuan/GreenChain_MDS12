import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { getProjectCatalogue } from "../api/projectsApi.js";

const STATUS_OPTIONS = ["APPROVED", "UNREVIEWED", "REJECTED"];
const SORT_OPTIONS = [
  { value: "updated_desc", label: "Newest update" },
  { value: "updated_asc", label: "Oldest update" },
  { value: "project_name_asc", label: "Project A-Z" },
  { value: "project_name_desc", label: "Project Z-A" },
  { value: "organisation_asc", label: "Organisation A-Z" },
  { value: "organisation_desc", label: "Organisation Z-A" },
  { value: "period_desc", label: "Latest period" },
  { value: "period_asc", label: "Earliest period" },
];
const DEFAULT_STATUSES = ["APPROVED"];
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

function formatDate(value) {
  if (!value) {
    return "Not available";
  }
  return new Date(value).toLocaleDateString();
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

  return (
    <section className="page-panel project-catalogue">
      <div className="page-heading">
        <h1>Projects</h1>
      </div>

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
          <span>Period</span>
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

      <div className="catalogue-status-row" aria-label="Project status filters">
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

      {status === "loading" && <p>Loading projects...</p>}
      {status === "error" && (
        <div className="form-error" role="status">
          {error}
        </div>
      )}
      {status === "success" && (
        <div className="catalogue-summary" role="status">
          {catalogue.total_items} project{catalogue.total_items === 1 ? "" : "s"}
        </div>
      )}
      {status === "success" && projects.length === 0 && <p>No projects match the selected filters.</p>}
      {status === "success" && projects.length > 0 && (
        <div className="project-list">
          {projects.map((project) => (
            <Link key={project.project_id} to={`/projects/${project.project_id}`} className="project-list-item">
              <div className="project-card-header">
                <h2>{project.project_name}</h2>
                <span className={statusClass(project.status)}>{project.status}</span>
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
                  <dt>Reporting period</dt>
                  <dd>{project.reporting_period}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatDate(project.updated_at)}</dd>
                </div>
              </dl>
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
