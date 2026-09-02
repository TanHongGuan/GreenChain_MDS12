import { Outlet, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./auth/ProtectedRoute.jsx";
import { RoleRoute } from "./auth/RoleRoute.jsx";
import { Navbar } from "./components/Navbar.jsx";
import { AccessDenied } from "./components/AccessDenied.jsx";
import { HighlightedPage } from "./pages/HighlightedPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { ProjectsPage } from "./pages/ProjectsPage.jsx";
import { ReviewPlaceholder } from "./pages/ReviewPlaceholder.jsx";
import { UploadPlaceholder } from "./pages/UploadPlaceholder.jsx";

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
          <Route element={<RoleRoute allowedRoles={["UPLOADER"]} />}>
            <Route path="/upload" element={<UploadPlaceholder />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={["AUDITOR"]} />}>
            <Route path="/review" element={<ReviewPlaceholder />} />
          </Route>
          <Route path="/access-denied" element={<AccessDenied />} />
        </Route>
      </Route>
    </Routes>
  );
}
