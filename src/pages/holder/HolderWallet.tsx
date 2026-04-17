import { useState, useEffect } from "react";
import { User } from "lucide-react";
import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import PortalLayout from "@/components/layout/PortalLayout";
import DashboardSkeleton from "@/components/ui/DashboardSkeleton";
import QRCodeDisplay from "@/components/QRCodeDisplay";
import ShareCredentialDialog from "@/components/ShareCredentialDialog";
import Web3WalletCard from "@/components/Web3WalletCard";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useWeb3Wallet } from "@/hooks/useWeb3Wallet";
import { useCredentialNotifications } from "@/hooks/useCredentialNotifications";
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
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
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

  return (
    <PortalLayout title="Holder Wallet" portalType="holder" icon={<User className="h-5 w-5" style={{ color: "hsl(var(--holder))" }} />} navItems={navItems}>
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
