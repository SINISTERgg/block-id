import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import IssuerDashboard from "./pages/issuer/IssuerDashboard";
import HolderWallet from "./pages/holder/HolderWallet";
import VerifierDashboard from "./pages/verifier/VerifierDashboard";
import BlockchainExplorer from "./pages/BlockchainExplorer";
import AuditLog from "./pages/AuditLog";
import ProtectedRoute from "./components/ProtectedRoute";
import SharedCredential from "./pages/SharedCredential";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
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
            <Route path="/shared/:token" element={<SharedCredential />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
