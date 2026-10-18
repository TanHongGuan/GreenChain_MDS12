export const DEMO_USER_KEY = "greenchain-demo-user";

export const DEMO_ORGANISATIONS = Object.freeze([
  { id: "demo-civic-trust", name: "Demo Civic Trust" },
  { id: "demo-future-works", name: "Demo Future Works" },
]);

export const DEMO_USERS = Object.freeze([
  { id: 1, name: "Demo Viewer", email: "viewer@demo.greenchain.test", role: "VIEWER", organisation_id: null },
  { id: 2, name: "Demo Uploader", email: "uploader@demo.greenchain.test", role: "UPLOADER", organisation_id: "demo-civic-trust" },
  { id: 3, name: "Demo Auditor", email: "auditor@demo.greenchain.test", role: "AUDITOR", organisation_id: null },
  { id: 4, name: "Future Works Uploader", email: "future-uploader@demo.greenchain.test", role: "UPLOADER", organisation_id: "demo-future-works" },
  { id: 5, name: "Second Demo Auditor", email: "second-auditor@demo.greenchain.test", role: "AUDITOR", organisation_id: null },
]);

export function findDemoUserByEmail(email) {
  return DEMO_USERS.find((user) => user.email === String(email).trim().toLowerCase()) || null;
}

export function findDemoUserById(id) {
  return DEMO_USERS.find((user) => user.id === Number(id)) || null;
}

export function currentDemoUser() {
  try { return findDemoUserById(sessionStorage.getItem(DEMO_USER_KEY)); }
  catch { return null; }
}

export function setDemoUser(user) {
  sessionStorage.setItem(DEMO_USER_KEY, String(user.id));
}

export function clearDemoUser() {
  try { sessionStorage.removeItem(DEMO_USER_KEY); }
  catch { /* Session storage may be unavailable. */ }
}
