import { useEffect, useState } from "react";

import { getHighlightedProjects, removeHighlightedProject } from "../api/discoveryApi.js";
import { DiscoveryProjectCard } from "../components/DiscoveryProjectCard.jsx";

export function HighlightedPage() {
  const [projects, setProjects] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [updatingProjectId, setUpdatingProjectId] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setStatus("loading");
    setError("");

    getHighlightedProjects()
      .then((payload) => {
        if (!isMounted) {
          return;
        }
        setProjects(payload.projects || []);
        setStatus("success");
      })
      .catch((err) => {
        if (!isMounted) {
          return;
        }
        setError(err.message || "Unable to load highlighted projects.");
        setStatus("error");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleRemoveHighlight(project) {
    setUpdatingProjectId(project.project_id);
    setError("");
    try {
      await removeHighlightedProject(project.project_id);
      setProjects((current) => current.filter((item) => item.project_id !== project.project_id));
    } catch (err) {
      setError(err.message || "Unable to remove highlighted project.");
    } finally {
      setUpdatingProjectId(null);
    }
  }

  return (
    <section className="page-panel highlighted-page">
      <div className="page-heading">
        <h1>Highlighted</h1>
      </div>

      {status === "loading" && <p>Loading highlighted projects...</p>}
      {error && (
        <div className="form-error" role="status">
          {error}
        </div>
      )}
      {status === "success" && projects.length === 0 && <p>No highlighted projects yet.</p>}
      {status === "success" && projects.length > 0 && (
        <div className="discovery-card-grid">
          {projects.map((project) => (
            <DiscoveryProjectCard
              key={project.project_id}
              project={project}
              isUpdating={updatingProjectId === project.project_id}
              onToggleHighlight={handleRemoveHighlight}
            />
          ))}
        </div>
      )}
    </section>
  );
}
