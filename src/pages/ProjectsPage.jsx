import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getProjects } from "../api/projectsApi.js";

export function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setStatus("loading");

    getProjects()
      .then((data) => {
        if (!isMounted) {
          return;
        }
        setProjects(data);
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
  }, []);

  return (
    <section className="page-panel">
      <div className="page-heading">
        <h1>Projects</h1>
      </div>

      {status === "loading" && <p>Loading projects...</p>}
      {status === "error" && (
        <div className="form-error" role="status">
          {error}
        </div>
      )}
      {status === "success" && projects.length === 0 && <p>No projects found.</p>}
      {status === "success" && projects.length > 0 && (
        <div className="project-list">
          {projects.map((project) => (
            <Link key={project.project_id} to={`/projects/${project.project_id}`} className="project-list-item">
              <h2>{project.project_name}</h2>
              <p>{project.organisation}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
