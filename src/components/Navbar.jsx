import { NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.jsx";
import { canAccess, PERMISSIONS, roleLabel } from "../auth/permissions.js";

const baseLinks = [
  { to: "/", label: "Home" },
  { to: "/projects", label: "Projects" },
  { to: "/compare", label: "Compare" },
];

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const links = [...baseLinks];
  if (canAccess(user, PERMISSIONS.UPLOAD_SUBMISSION)) {
    links.push({ to: "/upload", label: "Upload Data" });
    links.push({ to: "/buildings", label: "Manage Buildings" });
  }
  if (canAccess(user, PERMISSIONS.REVIEW_SUBMISSION)) {
    links.push({ to: "/review", label: "Review" });
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
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
          <span>{roleLabel(user?.role).toUpperCase()}</span>
        </div>
        <button className="secondary-button" type="button" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </header>
  );
}
