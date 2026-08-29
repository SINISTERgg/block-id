import { useState, useEffect, useMemo } from "react";
import { User } from "lucide-react";
import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import PortalLayout from "@/components/layout/PortalLayout";
import DashboardSkeleton from "@/components/ui/DashboardSkeleton";
import QRCodeDisplay from "@/components/QRCodeDisplay";
import ShareCredentialDialog from "@/components/ShareCredentialDialog";
import Web3WalletCard from "@/components/Web3WalletCard";
import SmartWalletCard from "@/components/wallet/SmartWalletCard";
import TrustScoreCard from "@/components/wallet/TrustScoreCard";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useWeb3Wallet } from "@/hooks/useWeb3Wallet";
import { useCredentialNotifications } from "@/hooks/useCredentialNotifications";
import { computeTrustScore } from "@/lib/ml/trustScore";
import {
  fetchHolderCredentials,
  subscribeToHolderCredentials,
  generateDid as generateDidService,
} from "@/services/api/holder.service";
import type { HolderCredential } from "@/services/api/holder.service";
import WalletView from "./views/WalletView";
import PresentView from "./views/PresentView";

const navItems = [
  { label: "Wallet", path: "/holder" },
  { label: "Present", path: "/holder/present" },
];

const HolderWallet = () => {
  const location = useLocation();
  const currentView = location.pathname === "/holder/present" ? "present" : "wallet";

  const [credentials, setCredentials] = useState<HolderCredential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [qrValue, setQrValue] = useState("");
  const [qrTitle, setQrTitle] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [shareCredId, setShareCredId] = useState<string | null>(null);
  const [shareCredName, setShareCredName] = useState("");
  const [shareCredFields, setShareCredFields] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "revoked" | "expired">("all");

  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const { walletAddress, isAutoGeneratingDid } = useWeb3Wallet(user?.id, {
    onConnected: refreshProfile,
  });
  useCredentialNotifications();

  const loadCredentials = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const data = await fetchHolderCredentials(user.id);
      setCredentials(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user) { setIsLoading(false); return; }
    loadCredentials();
    const unsub = subscribeToHolderCredentials(user.id, loadCredentials);
    return unsub;
  }, [user]);

  const handleGenerateDid = async () => {
    if (!walletAddress || !user || profile?.did) return;
    try {
      const did = await generateDidService(user.id);
      toast({ title: "DID Generated", description: did });
      await refreshProfile();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  const showQR = (value: string, title: string) => { setQrValue(value); setQrTitle(title); setQrOpen(true); };
  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text); toast({ title: "Copied to clipboard" }); };
  const handleShareCred = (id: string, name: string, fields: string[]) => {
    setShareCredId(id); setShareCredName(name); setShareCredFields(fields);
  };

  const securityScore = (() => {
    let score = 0;
    if (profile?.did) score += 50;
    if (credentials.length > 0) score += 50;
    return score;
  })();

  // Phase 6 — explainable ML trust score over the holder's strongest active credential.
  const trustResult = useMemo(() => {
    const active = credentials.filter((c) => c.status === "active");
    if (!walletAddress && active.length === 0) return null;

    const best = [...active].sort((a, b) => {
      const anchored = Number(!!b.blockchain_anchor) - Number(!!a.blockchain_anchor);
      if (anchored !== 0) return anchored;
      return Date.parse(b.issued_at) - Date.parse(a.issued_at);
    })[0];

    return computeTrustScore({
      signatureValid: !!profile?.did,
      anchoredOnChain: !!best?.blockchain_anchor,
      notRevoked: best ? best.status !== "revoked" : true,
      notExpired: best ? best.status !== "expired" : true,
      issuerReputation: 70,
      zkProofVerified: false,
      credentialAgeDays: best
        ? Math.max(0, (Date.now() - Date.parse(best.issued_at)) / 86_400_000)
        : undefined,
    });
  }, [credentials, walletAddress, profile?.did]);

  return (
    <PortalLayout title="Holder Wallet" portalType="holder" icon={<User className="h-5 w-5" />} navItems={navItems}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] }}
        className="space-y-8"
      >
        {isLoading ? (
          <DashboardSkeleton stats={3} showCharts={false} listItems={currentView === "wallet" ? 4 : 3} />
        ) : (
          <>
            {currentView === "wallet" && (
              <>
                <WalletView
                  credentials={credentials}
                  searchQuery={searchQuery}
                  statusFilter={statusFilter}
                  onSearchChange={setSearchQuery}
                  onStatusFilterChange={setStatusFilter}
                  onShowQR={showQR}
                  onCopy={copyToClipboard}
                  onShareCred={handleShareCred}
                  holderDid={profile?.did ?? undefined}
                  holderName={profile?.full_name ?? undefined}
                  onGenerateDid={handleGenerateDid}
                  securityScore={securityScore}
                  isWalletConnected={!!walletAddress}
                />
                {/* Web3 card stays in wallet view shell */}
                <Web3WalletCard userId={user?.id} onConnected={refreshProfile} />
                <SmartWalletCard eoaAddress={walletAddress ?? undefined} />
                <TrustScoreCard result={trustResult} />
              </>
            )}
            {currentView === "present" && (
              <PresentView
                credentials={credentials}
                holderDid={profile?.did ?? undefined}
                onShowQR={showQR}
                onCopy={copyToClipboard}
                onShareCred={handleShareCred}
                isWalletConnected={!!walletAddress}
              />
            )}
          </>
        )}
      </motion.div>

      <QRCodeDisplay value={qrValue} title={qrTitle} open={qrOpen} onOpenChange={setQrOpen} />
      <ShareCredentialDialog
        credentialId={shareCredId || ""}
        credentialName={shareCredName}
        credentialFields={shareCredFields}
        open={!!shareCredId}
        onOpenChange={(o) => { if (!o) setShareCredId(null); }}
      />
    </PortalLayout>
  );
};

export default HolderWallet;
