import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.jsx";
import { AppLoading } from "../components/AppLoading.jsx";
import { getLoginAccounts } from "../services/dataService.js";
import { roleLabel } from "../auth/permissions.js";


function isLikelyEmail(value) {
  return value.includes("@") && !value.startsWith("@") && !value.endsWith("@");
}

function AccountSelectForm({ accounts, onSignedIn }) {
  const { loginAsAccount } = useAuth();
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!accountId) {
      setError("Choose an account.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      await loginAsAccount(accountId);
      onSignedIn();
    } catch {
      setError("Unable to sign in with that account. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-describedby={error ? "login-error" : undefined}>
      {error ? (
        <div className="form-error" id="login-error" role="alert">
          {error}
        </div>
      ) : null}

      <label htmlFor="account">Account</label>
      <select id="account" value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={isSubmitting}>
        <option value="">Choose an account</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name} · {roleLabel(account.role)} ({account.email})
          </option>
        ))}
      </select>
      {accounts.length === 0 ? <p className="field-error">No active accounts exist yet.</p> : null}

      <button className="primary-button" type="submit" disabled={isSubmitting || accounts.length === 0}>
        {isSubmitting ? "Logging in..." : "Log In"}
      </button>
    </form>
  );
}

function PasswordForm({ onSignedIn }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!email.trim() || !isLikelyEmail(email.trim())) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!password) {
      nextErrors.password = "Enter your password.";
    }
    setFieldErrors(nextErrors);
    setError("");

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email, password);
      onSignedIn();
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
    <form onSubmit={handleSubmit} noValidate aria-describedby={error ? "login-error" : undefined}>
      {error ? (
        <div className="form-error" id="login-error" role="alert">
          {error}
        </div>
      ) : null}

      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        aria-invalid={Boolean(fieldErrors.email)}
        aria-describedby={fieldErrors.email ? "email-error" : undefined}
        onChange={(event) => setEmail(event.target.value)}
      />
      {fieldErrors.email ? (
        <span className="field-error" id="email-error">
          {fieldErrors.email}
        </span>
      ) : null}

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
      {fieldErrors.password ? (
        <span className="field-error" id="password-error">
          {fieldErrors.password}
        </span>
      ) : null}

      <button className="primary-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Logging in..." : "Log In"}
      </button>
    </form>
  );
}

export function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // undefined = still asking the backend; null = account selection disabled (use password form).
  const [accounts, setAccounts] = useState(undefined);

  useEffect(() => {
    if (isLoading || isAuthenticated) {
      return undefined;
    }
    let active = true;
    getLoginAccounts()
      .then((result) => { if (active) setAccounts(result); })
      .catch(() => { if (active) setAccounts(null); });
    return () => { active = false; };
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
    return <AppLoading />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  function goToDestination() {
    navigate(location.state?.from?.pathname || "/", { replace: true });
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <p className="eyebrow">GreenChain</p>
        <h1 id="login-title">Sign in</h1>
        <p className="login-intro">
          {accounts ? "Choose an account to open its workspace." : "Access your GreenChain workspace."}
        </p>

        {accounts === undefined ? <p>Loading sign-in options...</p> : null}
        {Array.isArray(accounts) ? <AccountSelectForm accounts={accounts} onSignedIn={goToDestination} /> : null}
        {accounts === null ? <PasswordForm onSignedIn={goToDestination} /> : null}
      </section>
    </main>
  );
}
