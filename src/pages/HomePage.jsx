import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getHomeDiscovery } from "../services/dataService.js";
import { DiscoveryProjectCard } from "../components/DiscoveryProjectCard.jsx";

// The home page shows recently updated projects and nothing else. The platform
// summary, the recent-submissions table, the latest-approved panel and the
// featured and new sections are gone; Projects and Compare are where the rest
// of that belongs.

function DiscoverySection({
  id,
  title,
  projects,
  viewAllTo,
  note,
  emptyText = "No projects to show.",
}) {
  const items = projects || [];
  return (
    <section className="discovery-section" aria-labelledby={`${id}-heading`}>
      <div className="section-title-row">
        <h2 id={`${id}-heading`}>{title}</h2>
        <Link to={viewAllTo}>View all</Link>
      </div>
      {/* The backend states how a section is derived rather than implying an
          editorial choice; surface that wording instead of inventing our own. */}
      {note && <p className="section-note">{note}</p>}
      {items.length === 0 ? (
        <p>{emptyText}</p>
      ) : (
        <div className="discovery-card-grid">
          {items.slice(0, 4).map((project) => (
            <DiscoveryProjectCard
              key={project.project_id}
              project={project}
              showLatestDecision={false}
              showLocation={false}
              showLatestMetric={false}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function HomePage() {
  const [discovery, setDiscovery] = useState({ recently_updated: [] });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

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
        <DiscoverySection
          id="recent"
          title="Recently updated projects"
          projects={discovery.recently_updated}
          viewAllTo="/projects?sort=updated_desc"
        />
      )}
    </section>
  );
}
