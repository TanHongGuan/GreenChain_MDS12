import { Link } from "react-router-dom";

export function AccessDenied() {
  return (
    <section className="page-panel" aria-labelledby="access-denied-title">
      <p className="eyebrow">403</p>
      <h1 id="access-denied-title">Access Denied</h1>
      <p>You do not have permission to access this page.</p>
      <Link className="text-link" to="/">
        Return home
      </Link>
    </section>
  );
}
