import { useState, useEffect, useCallback, useMemo } from "react";
import { Building2 } from "lucide-react";
import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import PortalLayout from "@/components/layout/PortalLayout";
import DashboardSkeleton from "@/components/ui/DashboardSkeleton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchLatestVerificationRecords } from "@/services/api/verifier.service";
import type { VerificationRecord } from "@/services/api/verifier.service";
import VerifierDashboardView from "./views/VerifierDashboardView";
import VerifyView from "./views/VerifyView";
import ReceivedPresentationsView from "./views/ReceivedPresentationsView";
import HistoryView from "./views/HistoryView";
import AnalyticsView from "./views/AnalyticsView";
import ZKPStudioView from "./views/ZKPStudioView";
import SBTInspectorView from "./views/SBTInspectorView";
import PolicyView from "./views/PolicyView";
import ThreatIntelView from "./views/ThreatIntelView";
import ComplianceView from "./views/ComplianceView";
import { isAwaitingVerification } from "@/lib/verifier/intelligence";
import { MOTION } from "@/lib/motion";

/**
 * Single source of truth for verifier sub-navigation. The `view` key is matched
 * against the pathname, so adding a route means adding one entry here rather
 * than editing the switch and the nav list separately.
 */
const VIEWS = {
  dashboard: "/verifier",
  verify: "/verifier/verify",
  presentations: "/verifier/presentations",
  history: "/verifier/history",
  analytics: "/verifier/analytics",
  zkp: "/verifier/zkp",
  sbt: "/verifier/sbt",
  policies: "/verifier/policies",
  threat: "/verifier/threat",
  compliance: "/verifier/compliance",
} as const;

type ViewKey = keyof typeof VIEWS;

const baseNavItems = [
  { label: "Dashboard", path: VIEWS.dashboard },
  { label: "Verify", path: VIEWS.verify },
  { label: "Inbox", path: VIEWS.presentations },
  { label: "History", path: VIEWS.history },
  { label: "Analytics", path: VIEWS.analytics },
  { label: "ZKP Studio", path: VIEWS.zkp },
  { label: "SBT", path: VIEWS.sbt },
  { label: "Policies", path: VIEWS.policies },
  { label: "Threat Intel", path: VIEWS.threat },
  { label: "Compliance", path: VIEWS.compliance },
];

/** Longest path wins, so `/verifier/analytics` is never read as `/verifier`. */
function viewForPath(pathname: string): ViewKey {
  const hit = (Object.entries(VIEWS) as [ViewKey, string][])
    .filter(([key, path]) => key !== "dashboard" && pathname.startsWith(path))
    .sort((a, b) => b[1].length - a[1].length)[0];
  return hit ? hit[0] : "dashboard";
}

/** Views that need the verifier's record history before they can render. */
const RECORD_DEPENDENT: ViewKey[] = [
  "dashboard", "verify", "presentations", "history", "analytics", "threat", "compliance",
];

const VerifierDashboard = () => {
  const location = useLocation();
  const currentView = useMemo(() => viewForPath(location.pathname), [location.pathname]);

  const [records, setRecords] = useState<VerificationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const { user } = useAuth();

  // Unread badge on the Inbox nav item — presentations waiting on us.
  const inboxCount = useMemo(() => records.filter(isAwaitingVerification).length, [records]);

  const navItems = useMemo(
    () =>
      baseNavItems.map((item) => ({
        ...item,
        badge: item.path === VIEWS.presentations ? inboxCount : undefined,
      })),
    [inboxCount]
  );

  const loadRecords = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const data = await fetchLatestVerificationRecords(user.id);
      setRecords(data);
      setRefreshSignal((n) => n + 1);
    } catch {
      // keep previous data on failure
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
        initial={{ opacity: 0, y: MOTION.DISTANCE }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: MOTION.DURATION, ease: MOTION.EASE }}
      >
        {isLoading && records.length === 0 && RECORD_DEPENDENT.includes(currentView) ? (
          <DashboardSkeleton stats={4} showCharts={currentView === "dashboard" || currentView === "analytics"} listItems={currentView === "history" ? 5 : 3} />
        ) : (
          <>
            {currentView === "dashboard" && <VerifierDashboardView records={records} />}
            {currentView === "verify" && <VerifyView verifierId={user!.id} onRecordsRefresh={loadRecords} />}
            {currentView === "presentations" && (
              <ReceivedPresentationsView
                verifierId={user!.id}
                records={records}
                onRecordsRefresh={loadRecords}
              />
            )}
            {currentView === "history" && <HistoryView verifierId={user!.id} refreshSignal={refreshSignal} />}
            {currentView === "analytics" && <AnalyticsView records={records} />}
            {currentView === "zkp" && <ZKPStudioView />}
            {currentView === "sbt" && <SBTInspectorView />}
            {currentView === "policies" && <PolicyView verifierId={user!.id} history={records} />}
            {currentView === "threat" && <ThreatIntelView verifierId={user!.id} history={records} />}
            {currentView === "compliance" && <ComplianceView verifierId={user!.id} history={records} />}
          </>
        )}
      </motion.div>
    </PortalLayout>
  );
};

export default VerifierDashboard;
