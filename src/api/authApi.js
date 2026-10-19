const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function parseResponse(response) {
  if (response.status === 204) {
    return null;
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Unable to complete request.");
    error.status = response.status;
    error.code = payload?.error?.code;
    throw error;
  }

  return payload;
}

export async function login(email, password) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  const payload = await parseResponse(response);
  return payload.user;
}

// Accounts offered by the demo account-select login, or null when the backend has it disabled
// (ACCOUNT_SELECT_LOGIN=false answers 404) so the page falls back to email and password.
export async function getLoginAccounts() {
  const response = await fetch(`${API_BASE_URL}/auth/accounts`, { credentials: "include" });
  if (response.status === 404) {
    return null;
  }
  const payload = await parseResponse(response);
  return payload.accounts;
}

export async function loginAsAccount(userId) {
  const response = await fetch(`${API_BASE_URL}/auth/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ user_id: userId }),
  });
  const payload = await parseResponse(response);
  return payload.user;
}

export async function getCurrentUser() {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    credentials: "include",
  });
  const payload = await parseResponse(response);
  return payload.user;
}

export async function logout() {
  const response = await fetch(`${API_BASE_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  await parseResponse(response);
}
