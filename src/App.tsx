import { lazy, Suspense, useMemo } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardSkeleton from "./components/ui/DashboardSkeleton";
import RoleGuard from "./components/routing/RoleGuard";

// ── Lazy-loaded route pages ──────────────────────────────────────────
const Landing = lazy(() => import("./pages/Landing"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const IssuerDashboard = lazy(() => import("./pages/issuer/IssuerDashboard"));
const HolderWallet = lazy(() => import("./pages/holder/HolderWallet"));
const VerifierDashboard = lazy(() => import("./pages/verifier/VerifierDashboard"));
const BlockchainExplorer = lazy(() => import("./pages/BlockchainExplorer"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const SharedCredential = lazy(() => import("./pages/SharedCredential"));
const OrgManagement = lazy(() => import("./pages/admin/AdminDashboard"));
const PendingApproval = lazy(() => import("./pages/PendingApproval"));
const AccountRejected = lazy(() => import("./pages/AccountRejected"));
const NotFound = lazy(() => import("./pages/NotFound"));

// ── Loading fallback ─────────────────────────────────────────────────
const PageFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center p-6">
    <div className="w-full max-w-5xl">
      <DashboardSkeleton stats={4} showCharts={false} listItems={3} />
    </div>
  </div>
);

const App = () => {
  // Instantiated inside the component so it is created once per app mount
  // and is properly garbage-collected on unmount. This avoids stale state
  // during HMR and keeps the client isolated in tests.
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  {/* Public routes */}
                  <Route path="/" element={<Landing />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/pending-approval" element={<PendingApproval />} />
                  <Route path="/account-rejected" element={<AccountRejected />} />
                  <Route path="/shared/:token" element={<SharedCredential />} />

                  {/* Issuer portal — wrapped in its own ErrorBoundary */}
                  <Route path="/issuer" element={
                    <ErrorBoundary>
                      <ProtectedRoute requiredRole="issuer"><IssuerDashboard /></ProtectedRoute>
                    </ErrorBoundary>
                  } />
                  <Route path="/issuer/*" element={
                    <ErrorBoundary>
                      <ProtectedRoute requiredRole="issuer"><IssuerDashboard /></ProtectedRoute>
                    </ErrorBoundary>
                  } />

                  {/* Holder portal — wrapped in its own ErrorBoundary */}
                  <Route path="/holder" element={
                    <ErrorBoundary>
                      <ProtectedRoute requiredRole="holder"><HolderWallet /></ProtectedRoute>
                    </ErrorBoundary>
                  } />
                  <Route path="/holder/*" element={
                    <ErrorBoundary>
                      <ProtectedRoute requiredRole="holder"><HolderWallet /></ProtectedRoute>
                    </ErrorBoundary>
                  } />

                  {/* Verifier portal — wrapped in its own ErrorBoundary */}
                  <Route path="/verifier" element={
                    <ErrorBoundary>
                      <ProtectedRoute requiredRole="verifier"><VerifierDashboard /></ProtectedRoute>
                    </ErrorBoundary>
                  } />
                  <Route path="/verifier/*" element={
                    <ErrorBoundary>
                      <ProtectedRoute requiredRole="verifier"><VerifierDashboard /></ProtectedRoute>
                    </ErrorBoundary>
                  } />

                  {/* Blockchain Explorer — available to issuer, holder, and admin portals only */}
                  <Route path="/explorer" element={
                    <ErrorBoundary>
                      <ProtectedRoute>
                        <RoleGuard denyRoles={["verifier"]}>
                          <BlockchainExplorer />
                        </RoleGuard>
                      </ProtectedRoute>
                    </ErrorBoundary>
                  } />

                  {/* Audit log */}
                  <Route path="/audit" element={
                    <ErrorBoundary>
                      <ProtectedRoute><AuditLog /></ProtectedRoute>
                    </ErrorBoundary>
                  } />

                  {/* Admin portal — wrapped in its own ErrorBoundary */}
                  <Route path="/admin" element={
                    <ErrorBoundary>
                      <ProtectedRoute requiredRole="org_admin"><OrgManagement /></ProtectedRoute>
                    </ErrorBoundary>
                  } />
                  <Route path="/admin/*" element={
                    <ErrorBoundary>
                      <ProtectedRoute requiredRole="org_admin"><OrgManagement /></ProtectedRoute>
                    </ErrorBoundary>
                  } />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
