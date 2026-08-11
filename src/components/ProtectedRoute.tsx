import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: string;
}

const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, loading, profileLoading, role, accountStatus } = useAuth();

  // Wait until session AND profile/role are fully loaded before making routing decisions.
  // Without this guard, `role` is briefly null even for authenticated users (causing
  // a false redirect to "/" on hard refresh to a role-protected route).
  if (loading || (user && profileLoading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse-subtle text-muted-foreground font-display">Loading...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (requiredRole && role !== requiredRole) return <Navigate to="/" replace />;

  // Approval gate: issuers and verifiers must be admin-approved before accessing portals
  if ((role === "issuer" || role === "verifier") && accountStatus !== "approved") {
    if (accountStatus === "rejected") {
      return <Navigate to="/account-rejected" replace />;
    }
    // pending or any other non-approved status
    return <Navigate to="/pending-approval" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
