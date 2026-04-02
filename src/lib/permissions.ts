// ── Role & Permission Types ───────────────────────────────────────────────────

export type OrgRole = "org_admin" | "issuer" | "verifier" | "holder" | "auditor";

export type Permission =
  | "schema:create"
  | "schema:version"
  | "credential:issue"
  | "credential:revoke"
  | "credential:verify"
  | "credential:view"
  | "credential:present"
  | "credential:share"
  | "credential:export"
  | "credential:migrate"
  | "presentation:request"
  | "registry:review"
  | "member:invite"
  | "member:remove"
  | "audit:view"
  | "analytics:view";

// ── Role → Permission Mapping ─────────────────────────────────────────────────

export const ROLE_PERMISSIONS: Record<OrgRole, Permission[]> = {
  org_admin: [
    "schema:create",
    "schema:version",
    "credential:issue",
    "credential:revoke",
    "credential:verify",
    "credential:view",
    "credential:present",
    "credential:share",
    "credential:export",
    "credential:migrate",
    "presentation:request",
    "registry:review",
    "member:invite",
    "member:remove",
    "audit:view",
    "analytics:view",
  ],
  issuer: [
    "schema:create",
    "schema:version",
    "credential:issue",
    "credential:revoke",
    "credential:view",
    "credential:migrate",
    "audit:view",
    "analytics:view",
  ],
  verifier: [
    "credential:verify",
    "credential:view",
    "presentation:request",
    "registry:review",
    "audit:view",
    "analytics:view",
  ],
  holder: [
    "credential:view",
    "credential:present",
    "credential:share",
    "credential:export",
  ],
  auditor: ["credential:view", "audit:view", "analytics:view"],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if the given role has the specified permission.
 * Also accepts raw DB role strings like "issuer" / "verifier" etc.
 */
export function hasPermission(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role as OrgRole];
  if (!permissions) return false;
  return permissions.includes(permission);
}

/**
 * Returns true if the role is allowed to approve/reject issuer registrations.
 * Convenience helper used in TrustedIssuerRegistry.
 */
export function canReviewRegistry(role: string | null | undefined): boolean {
  return hasPermission(role, "registry:review");
}

/**
 * Returns true if the role is an org_admin.
 */
export function isOrgAdmin(role: string | null | undefined): boolean {
  return role === "org_admin";
}

// ── Hook ──────────────────────────────────────────────────────────────────────
// usePermission() has been moved to src/hooks/usePermission.ts
// so that this file remains a pure, non-React utility module.
