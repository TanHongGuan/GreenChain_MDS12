import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./auth/ProtectedRoute.jsx";
import { RoleRoute } from "./auth/RoleRoute.jsx";
import { Navbar } from "./components/Navbar.jsx";
import { AccessDenied } from "./components/AccessDenied.jsx";
import { HighlightedPage } from "./pages/HighlightedPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { ProjectDetailPage } from "./pages/ProjectDetailPage.jsx";
import { ProjectsPage } from "./pages/ProjectsPage.jsx";
import { ComparePage } from "./pages/ComparePage.jsx";
import { ReviewPlaceholder } from "./pages/ReviewPlaceholder.jsx";
import { UploadPlaceholder } from "./pages/UploadPlaceholder.jsx";
import { ManageBuildingsPage } from "./pages/ManageBuildingsPage.jsx";
import { canAccess, PERMISSIONS } from "./auth/permissions.js";

function AppLayout() {
  return (
    <>
      <Navbar />
      <main className="app-shell">
        <Outlet />
      </main>
    </>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="/highlighted" element={<HighlightedPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route
            element={
              <RoleRoute
                permission={(user) => canAccess(user, PERMISSIONS.UPLOAD_SUBMISSION)}
              />
            }
          >
            <Route path="/upload" element={<UploadPlaceholder />} />
            <Route path="/buildings" element={<ManageBuildingsPage />} />
          </Route>
          <Route
            element={
              <RoleRoute
                permission={(user) => canAccess(user, PERMISSIONS.REVIEW_SUBMISSION)}
              />
            }
          >
            <Route path="/review" element={<ReviewPlaceholder />} />
          </Route>
          <Route path="/access-denied" element={<AccessDenied />} />
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
