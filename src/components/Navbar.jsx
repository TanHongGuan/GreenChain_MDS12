import { NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.jsx";
import { canAccess, PERMISSIONS } from "../auth/permissions.js";
import { isMockMode, resetDemoData } from "../services/dataService.js";

const baseLinks = [
  { to: "/", label: "Home" },
  { to: "/highlighted", label: "Highlighted" },
  { to: "/projects", label: "Projects" },
  { to: "/compare", label: "Compare" },
];

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const links = [...baseLinks];
  if (canAccess(user, PERMISSIONS.UPLOAD_SUBMISSION)) {
    if (isMockMode) links.push({ to: "/my-buildings", label: "My Buildings" });
    links.push({ to: "/upload", label: "Upload Data" });
  }
  if (canAccess(user, PERMISSIONS.REVIEW_SUBMISSION)) {
    links.push({ to: "/review", label: "Review" });
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  function handleDemoReset() {
    if (window.confirm("Reset all demo projects, submissions and highlights in this browser session? This cannot be undone.")) {
      resetDemoData(true);
      navigate("/", { replace: true });
      window.location.reload();
    }
  }

  return (
    <header className="navbar">
      <div className="brand">GreenChain</div>
      <nav aria-label="Primary navigation">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} className={({ isActive }) => (isActive ? "active" : undefined)} end={link.to === "/"}>
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="profile">
        <div>
          <strong>{user?.name}</strong>
          <span>{user?.email}</span>
          <span>{user?.role}</span>
        </div>
        {isMockMode && <button className="secondary-button" type="button" onClick={handleDemoReset}>Reset demo data</button>}
        <button className="secondary-button" type="button" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </header>
  );
}
