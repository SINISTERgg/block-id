import { useState, useEffect, useCallback } from "react";
import { Building2 } from "lucide-react";
import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import PortalLayout from "@/components/layout/PortalLayout";
import DashboardSkeleton from "@/components/ui/DashboardSkeleton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchVerificationRecords } from "@/services/api/verifier.service";
import type { VerificationRecord } from "@/services/api/verifier.service";
import VerifierDashboardView from "./views/VerifierDashboardView";
import VerifyView from "./views/VerifyView";
import HistoryView from "./views/HistoryView";

const navItems = [
  { label: "Dashboard", path: "/verifier" },
  { label: "Verify", path: "/verifier/verify" },
  { label: "History", path: "/verifier/history" },
];

const VerifierDashboard = () => {
  const location = useLocation();
  const currentView =
    location.pathname === "/verifier/verify" ? "verify"
    : location.pathname === "/verifier/history" ? "history"
    : "dashboard";

  const [records, setRecords] = useState<VerificationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [historySearch, setHistorySearch] = useState("");

  const { user } = useAuth();

  const loadRecords = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const data = await fetchVerificationRecords(user.id);
      setRecords(data);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) { setIsLoading(false); return; }
    loadRecords();

    // Realtime: auto-refresh when any verification_request for this verifier changes
    const channel = supabase
      .channel(`verifier-requests-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "verification_requests" },
        (payload) => {
          const row = (payload.new ?? payload.old) as any;
          if (row?.verifier_id === user.id) loadRecords();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadRecords]);

  return (
    <PortalLayout
      title="Verifier Portal"
      portalType="verifier"
      icon={<Building2 className="h-5 w-5" />}
      navItems={navItems}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] }}
        className="space-y-8"
      >
        {isLoading ? (
          <DashboardSkeleton stats={4} showCharts={currentView === "dashboard"} listItems={currentView === "history" ? 5 : 3} />
        ) : (
          <>
            {currentView === "dashboard" && <VerifierDashboardView records={records} />}
            {currentView === "verify" && <VerifyView verifierId={user!.id} onRecordsRefresh={loadRecords} />}
            {currentView === "history" && (
              <HistoryView records={records} searchQuery={historySearch} onSearchChange={setHistorySearch} />
            )}
          </>
        )}
      </motion.div>
    </PortalLayout>
  );
};

export default VerifierDashboard;
