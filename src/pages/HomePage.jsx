import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { addHighlightedProject, getHomeDiscovery, removeHighlightedProject } from "../api/discoveryApi.js";
import { DiscoveryProjectCard } from "../components/DiscoveryProjectCard.jsx";

const SECTION_LINKS = {
  recently_updated: "/projects?sort=updated_desc",
  featured: "/projects?status=APPROVED&sort=period_desc",
  new_projects: "/projects?sort=created_desc",
};

function DiscoverySection({ title, projects, viewAllUrl, updatingProjectId, onToggleHighlight }) {
  return (
    <section className="discovery-section" aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}>
      <div className="section-title-row">
        <h2 id={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}>{title}</h2>
        <Link to={viewAllUrl} className="text-link">
          View All
        </Link>
      </div>
      {projects.length === 0 ? (
        <p>No projects to show.</p>
      ) : (
        <div className="discovery-card-grid">
          {projects.map((project) => (
            <DiscoveryProjectCard
              key={project.project_id}
              project={project}
              isUpdating={updatingProjectId === project.project_id}
              onToggleHighlight={onToggleHighlight}
            />
          ))}
        </div>
      )}
    </section>
  );
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

  useEffect(() => {
    let isMounted = true;
    setStatus("loading");
    setError("");

    getHomeDiscovery()
      .then((payload) => {
        if (!isMounted) {
          return;
        }
        setDiscovery(payload);
        setStatus("success");
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
          <DiscoverySection
            title="Recently Updated"
            projects={discovery.recently_updated || []}
            viewAllUrl={SECTION_LINKS.recently_updated}
            updatingProjectId={updatingProjectId}
            onToggleHighlight={handleToggleHighlight}
          />
          <DiscoverySection
            title="Featured Sustainable Projects"
            projects={discovery.featured || []}
            viewAllUrl={SECTION_LINKS.featured}
            updatingProjectId={updatingProjectId}
            onToggleHighlight={handleToggleHighlight}
          />
          <DiscoverySection
            title="New Projects"
            projects={discovery.new_projects || []}
            viewAllUrl={SECTION_LINKS.new_projects}
            updatingProjectId={updatingProjectId}
            onToggleHighlight={handleToggleHighlight}
          />
        </>
      )}
    </section>
  );
}
