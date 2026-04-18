import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardSkeleton from "./components/ui/DashboardSkeleton";

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
const OrgManagement = lazy(() => import("./pages/admin/OrgManagement"));
const AdminPortal = lazy(() => import("./pages/admin/AdminPortal"));
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

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/issuer" element={<ProtectedRoute requiredRole="issuer"><IssuerDashboard /></ProtectedRoute>} />
                <Route path="/issuer/*" element={<ProtectedRoute requiredRole="issuer"><IssuerDashboard /></ProtectedRoute>} />
                <Route path="/holder" element={<ProtectedRoute requiredRole="holder"><HolderWallet /></ProtectedRoute>} />
                <Route path="/holder/*" element={<ProtectedRoute requiredRole="holder"><HolderWallet /></ProtectedRoute>} />
                <Route path="/verifier" element={<ProtectedRoute requiredRole="verifier"><VerifierDashboard /></ProtectedRoute>} />
                <Route path="/verifier/*" element={<ProtectedRoute requiredRole="verifier"><VerifierDashboard /></ProtectedRoute>} />
                <Route path="/explorer" element={<ProtectedRoute><BlockchainExplorer /></ProtectedRoute>} />
                <Route path="/audit" element={<ProtectedRoute><AuditLog /></ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute requiredRole="org_admin"><OrgManagement /></ProtectedRoute>} />
                <Route path="/admin/*" element={<ProtectedRoute requiredRole="org_admin"><OrgManagement /></ProtectedRoute>} />
                <Route path="/admin-portal" element={<AdminPortal />} />
                <Route path="/pending-approval" element={<PendingApproval />} />
                <Route path="/account-rejected" element={<AccountRejected />} />
                <Route path="/shared/:token" element={<SharedCredential />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
