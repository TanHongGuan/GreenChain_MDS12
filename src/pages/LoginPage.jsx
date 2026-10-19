import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.jsx";
import { AppLoading } from "../components/AppLoading.jsx";
import { isMockMode } from "../services/dataService.js";
import { DEMO_USERS } from "../mocks/identity.js";

const REAL_ACCOUNTS = [
  { role: "Viewer", email: "viewer@greenchain.test" },
  { role: "Uploader", email: "uploader@greenchain.test" },
  { role: "Auditor", email: "auditor@greenchain.test" },
];

function isLikelyEmail(value) {
  return value.includes("@") && !value.startsWith("@") && !value.endsWith("@");
}

export function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [useCustomEmail, setUseCustomEmail] = useState(false);
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) {
    return <AppLoading />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (isMockMode ? !DEMO_USERS.some((user) => user.email === email) : !email.trim() || !isLikelyEmail(email.trim())) {
      nextErrors.email = isMockMode ? "Choose a demo identity." : "Enter a valid email address.";
    }
    if (!isMockMode && !password) {
      nextErrors.password = "Enter your password.";
    }
    setFieldErrors(nextErrors);
    setError("");

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email, isMockMode ? undefined : password);
      const destination = location.state?.from?.pathname || "/";
      navigate(destination, { replace: true });
    } catch (requestError) {
      if (requestError.code === "INVALID_CREDENTIALS" || requestError.status === 401) {
        setError("Email or password is incorrect.");
      } else {
        setError("Unable to sign in. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <p className="eyebrow">GreenChain</p>
        <h1 id="login-title">Sign in</h1>
        <p className="login-intro">Access your GreenChain workspace.</p>

        <form onSubmit={handleSubmit} noValidate aria-describedby={error ? "login-error" : undefined}>
          {error ? (
            <div className="form-error" id="login-error" role="alert">
              {error}
            </div>
          ) : null}

          {isMockMode ? <>
            <label htmlFor="email">Demo user</label>
            <select id="email" name="email" value={email} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "email-error" : undefined} onChange={(event) => setEmail(event.target.value)}>
              <option value="">Choose a user</option>
              {DEMO_USERS.map((user) => <option key={user.id} value={user.email}>{user.name} ({user.email})</option>)}
            </select>
            <p className="demo-label">Local demo only. This does not authenticate against the backend.</p>
          </> : <>
            <label htmlFor="email">Email</label>
            <select
              id="email"
              name="email"
              value={useCustomEmail ? "other" : email}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              onChange={(event) => {
                setUseCustomEmail(event.target.value === "other");
                setEmail(event.target.value === "other" ? "" : event.target.value);
              }}
            >
              <option value="">Choose an account</option>
              {REAL_ACCOUNTS.map((account) => (
                <option key={account.email} value={account.email}>{account.role} ({account.email})</option>
              ))}
              <option value="other">Other email</option>
            </select>
            {useCustomEmail ? <>
              <label htmlFor="custom-email">Other email</label>
              <input
                id="custom-email"
                type="email"
                autoComplete="email"
                value={email}
                aria-invalid={Boolean(fieldErrors.email)}
                onChange={(event) => setEmail(event.target.value)}
              />
            </> : null}
          </>}
          {fieldErrors.email ? (
            <span className="field-error" id="email-error">
              {fieldErrors.email}
            </span>
          ) : null}

          {!isMockMode && <>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
              onChange={(event) => setPassword(event.target.value)}
            />
          </>}
          {!isMockMode && fieldErrors.password ? (
            <span className="field-error" id="password-error">
              {fieldErrors.password}
            </span>
          ) : null}

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Logging in..." : "Log In"}
          </button>
        </form>
      </section>
    </main>
  );
}
