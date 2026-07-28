import { describe, it, expect } from "vitest";
import {
  hasPermission,
  canReviewRegistry,
  isOrgAdmin,
  ROLE_PERMISSIONS,
  type OrgRole,
  type Permission,
} from "./permissions";

describe("ROLE_PERMISSIONS", () => {
  it("defines permissions for all 5 roles", () => {
    expect(Object.keys(ROLE_PERMISSIONS)).toHaveLength(5);
    expect(ROLE_PERMISSIONS.org_admin).toBeDefined();
    expect(ROLE_PERMISSIONS.issuer).toBeDefined();
    expect(ROLE_PERMISSIONS.verifier).toBeDefined();
    expect(ROLE_PERMISSIONS.holder).toBeDefined();
    expect(ROLE_PERMISSIONS.auditor).toBeDefined();
  });

  it("org_admin has all permissions", () => {
    const allPermissions: Permission[] = [
      "schema:create", "schema:version", "credential:issue", "credential:revoke",
      "credential:verify", "credential:view", "credential:present", "credential:share",
      "credential:export", "credential:migrate", "presentation:request", "registry:review",
      "member:invite", "member:remove", "audit:view", "analytics:view",
    ];
    for (const perm of allPermissions) {
      expect(ROLE_PERMISSIONS.org_admin).toContain(perm);
    }
  });

  it("holder has limited permissions (no schema, no issue, no revoke)", () => {
    expect(ROLE_PERMISSIONS.holder).toContain("credential:view");
    expect(ROLE_PERMISSIONS.holder).toContain("credential:present");
    expect(ROLE_PERMISSIONS.holder).toContain("credential:share");
    expect(ROLE_PERMISSIONS.holder).toContain("credential:export");
    expect(ROLE_PERMISSIONS.holder).not.toContain("schema:create");
    expect(ROLE_PERMISSIONS.holder).not.toContain("credential:issue");
    expect(ROLE_PERMISSIONS.holder).not.toContain("credential:revoke");
  });

  it("issuer can create schemas and issue credentials", () => {
    expect(ROLE_PERMISSIONS.issuer).toContain("schema:create");
    expect(ROLE_PERMISSIONS.issuer).toContain("credential:issue");
    expect(ROLE_PERMISSIONS.issuer).toContain("credential:revoke");
  });

  it("verifier can verify and request presentations", () => {
    expect(ROLE_PERMISSIONS.verifier).toContain("credential:verify");
    expect(ROLE_PERMISSIONS.verifier).toContain("presentation:request");
    expect(ROLE_PERMISSIONS.verifier).toContain("registry:review");
  });

  it("auditor has only view permissions", () => {
    expect(ROLE_PERMISSIONS.auditor).toContain("credential:view");
    expect(ROLE_PERMISSIONS.auditor).toContain("audit:view");
    expect(ROLE_PERMISSIONS.auditor).toContain("analytics:view");
    expect(ROLE_PERMISSIONS.auditor).not.toContain("credential:issue");
    expect(ROLE_PERMISSIONS.auditor).not.toContain("schema:create");
  });
});

describe("hasPermission", () => {
  it("returns true when role has the permission", () => {
    expect(hasPermission("holder", "credential:view")).toBe(true);
    expect(hasPermission("org_admin", "member:remove")).toBe(true);
    expect(hasPermission("issuer", "schema:create")).toBe(true);
  });

  it("returns false when role lacks the permission", () => {
    expect(hasPermission("holder", "credential:issue")).toBe(false);
    expect(hasPermission("auditor", "credential:revoke")).toBe(false);
  });

  it("returns false for null role", () => {
    expect(hasPermission(null, "credential:view")).toBe(false);
  });

  it("returns false for undefined role", () => {
    expect(hasPermission(undefined, "credential:view")).toBe(false);
  });

  it("returns false for unknown role string", () => {
    expect(hasPermission("super_admin", "credential:view")).toBe(false);
  });

  it("returns false for empty string role", () => {
    expect(hasPermission("", "credential:view")).toBe(false);
  });
});

describe("canReviewRegistry", () => {
  it("returns true for org_admin", () => {
    expect(canReviewRegistry("org_admin")).toBe(true);
  });

  it("returns true for verifier", () => {
    expect(canReviewRegistry("verifier")).toBe(true);
  });

  it("returns false for holder", () => {
    expect(canReviewRegistry("holder")).toBe(false);
  });

  it("returns false for issuer", () => {
    expect(canReviewRegistry("issuer")).toBe(false);
  });

  it("returns false for null", () => {
    expect(canReviewRegistry(null)).toBe(false);
  });
});

describe("isOrgAdmin", () => {
  it("returns true for org_admin", () => {
    expect(isOrgAdmin("org_admin")).toBe(true);
  });

  it("returns false for other roles", () => {
    expect(isOrgAdmin("issuer")).toBe(false);
    expect(isOrgAdmin("holder")).toBe(false);
    expect(isOrgAdmin("verifier")).toBe(false);
    expect(isOrgAdmin("auditor")).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isOrgAdmin(null)).toBe(false);
    expect(isOrgAdmin(undefined)).toBe(false);
  });
});
