import { useAuth } from "@/hooks/useAuth";
import { hasPermission, isOrgAdmin } from "@/lib/permissions";
import type { Permission } from "@/lib/permissions";

/**
 * Convenience hook that returns permission helpers for the currently logged-in user.
 *
 * @example
 * const { can, isOrgAdmin } = usePermission();
 * if (can("registry:review")) { ... }
 */
export function usePermission() {
  const { role } = useAuth();

  return {
    role,
    can: (permission: Permission) => hasPermission(role, permission),
    isOrgAdmin: isOrgAdmin(role),
  };
}
