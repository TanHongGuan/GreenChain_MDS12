export const ROLES = Object.freeze({
  VIEWER: "VIEWER",
  UPLOADER: "UPLOADER",
  AUDITOR: "AUDITOR",
});

// What each role is called in the interface. The stored role, the JWT claim and
// every permission check still use UPLOADER - renaming those would mean a data
// migration and new token values for a change that is only ever read by a person.
export const ROLE_LABELS = Object.freeze({
  [ROLES.VIEWER]: "Viewer",
  [ROLES.UPLOADER]: "Company",
  [ROLES.AUDITOR]: "Auditor",
});

export function roleLabel(role) {
  return ROLE_LABELS[role] || role || "";
}

export const PERMISSIONS = Object.freeze({
  VIEW_SHARED: "VIEW_SHARED",
  UPLOAD_SUBMISSION: "UPLOAD_SUBMISSION",
  REVIEW_SUBMISSION: "REVIEW_SUBMISSION",
});

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.VIEWER]: new Set([PERMISSIONS.VIEW_SHARED]),
  [ROLES.UPLOADER]: new Set([PERMISSIONS.VIEW_SHARED, PERMISSIONS.UPLOAD_SUBMISSION]),
  [ROLES.AUDITOR]: new Set([PERMISSIONS.VIEW_SHARED, PERMISSIONS.REVIEW_SUBMISSION]),
});

export function canAccess(user, permission) {
  return Boolean(user?.role && ROLE_PERMISSIONS[user.role]?.has(permission));
}

export function roleCanAccess(role, permission) {
  return Boolean(role && ROLE_PERMISSIONS[role]?.has(permission));
}
