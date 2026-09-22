/**
 * RoleGuard — restricts a route to specific roles, redirecting others.
 * Extracted from App.tsx to be reusable for any role-based routing.
 *
 * Usage:
 *   <RoleGuard denyRoles={["verifier"]} redirectTo="/">
 *     <BlockchainExplorer />
 *   </RoleGuard>
 */
import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface RoleGuardProps {
  /** Roles that are NOT allowed to access this route. */
  denyRoles?: string[];
  /** Roles that ARE allowed (if provided, all others are denied). */
  allowRoles?: string[];
  /** Where to redirect if access is denied. Defaults to "/". */
  redirectTo?: string;
  children: ReactNode;
}

const RoleGuard = ({ denyRoles, allowRoles, redirectTo = "/", children }: RoleGuardProps) => {
  const { role } = useAuth();

  if (denyRoles && role && denyRoles.includes(role)) {
    return <Navigate to={redirectTo} replace />;
  }

  if (allowRoles && role && !allowRoles.includes(role)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};

export default RoleGuard;
