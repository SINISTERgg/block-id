import { useState, useEffect } from "react";
import { Shield } from "lucide-react";
import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import PortalLayout from "@/components/layout/PortalLayout";
import DashboardSkeleton from "@/components/ui/DashboardSkeleton";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useWeb3Wallet } from "@/hooks/useWeb3Wallet";
import { useOnChainRevocation } from "@/hooks/useOnChainRevocation";
import { useAnchorCredential } from "@/hooks/useAnchorCredential";
import {
  fetchSchemas,
  fetchCredentials,
  createSchema,
  createNewVersion,
  migrateCredentials,
  revokeCredential as revokeCredentialDb,
  deleteSchema,
} from "@/services/api/issuer.service";
import type { IssuerSchema, IssuerCredential, SchemaFieldDef } from "@/services/api/issuer.service";
import DashboardView from "./views/DashboardView";
import SchemasView from "./views/SchemasView";
import IssueView from "./views/IssueView";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { label: "Dashboard", path: "/issuer" },
  { label: "Schemas", path: "/issuer/schemas" },
  { label: "Issue", path: "/issuer/issue" },
];

const IssuerDashboard = () => {
  const location = useLocation();
  const currentView = location.pathname === "/issuer/schemas" ? "schemas" : location.pathname === "/issuer/issue" ? "issue" : "dashboard";

  const [isLoading, setIsLoading] = useState(true);
  const [schemas, setSchemas] = useState<IssuerSchema[]>([]);
  const [credentials, setCredentials] = useState<IssuerCredential[]>([]);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const { user } = useAuth();
  const { toast } = useToast();
  const { walletAddress, connectWallet, signMessage, isMetaMaskInstalled } = useWeb3Wallet(user?.id);
  const { anchor, anchorTxState, isContractReady } = useAnchorCredential();
  const { revoke: revokeOnChain } = useOnChainRevocation();

  const loadData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [s, c] = await Promise.all([fetchSchemas(user.id), fetchCredentials(user.id)]);
      setSchemas(s);
      setCredentials(c);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user) { setIsLoading(false); return; }
    loadData();
  }, [user]);

  // ── Schema callbacks ───────────────────────────────────────────────
  const handleCreateSchema = async (name: string, type: string, fields: SchemaFieldDef[]) => {
    if (!user || !name) return;
    const validFields = fields.filter((f) => f.name.trim() !== "");
    if (validFields.length === 0) { toast({ title: "Add at least one field", variant: "destructive" }); return; }
    try {
      await createSchema(user.id, name, type, validFields);
      toast({ title: "Schema created (v1)" });
      loadData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleNewVersion = async (base: IssuerSchema, name: string, type: string, fields: SchemaFieldDef[]) => {
    if (!user) return;
    const validFields = fields.filter((f) => f.name.trim() !== "");
    if (validFields.length === 0) { toast({ title: "Add at least one field", variant: "destructive" }); return; }
    try {
      const newSchema = await createNewVersion(user.id, base, name, type, validFields);
      toast({ title: `Schema updated to v${newSchema.version}` });
      loadData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleMigrate = async (targetSchema: IssuerSchema) => {
    if (!user) return;
    const rootId = targetSchema.parent_schema_id || targetSchema.id;
    const oldIds = schemas
      .filter((s) => (s.id === rootId || s.parent_schema_id === rootId) && s.id !== targetSchema.id)
      .map((s) => s.id);
    const credIds = credentials
      .filter((c) => c.status === "active" && c.schema_id && oldIds.includes(c.schema_id))
      .map((c) => c.id);

    if (credIds.length === 0) return;
    const { migrated, failed } = await migrateCredentials(user.id, targetSchema, credIds);
    toast({
      title: "Migration complete",
      description: `${migrated} credential${migrated !== 1 ? "s" : ""} migrated to v${targetSchema.version}${failed > 0 ? `, ${failed} failed` : ""}`,
      variant: failed > 0 ? "destructive" : undefined,
    });
    loadData();
  };

  const handleDeleteSchema = async (schema: IssuerSchema) => {
    if (!user) return;
    try {
      await deleteSchema(schema.id, user.id);
      toast({ title: "Schema deleted" });
      loadData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // ── Issue credential ───────────────────────────────────────────────
  const handleIssue = async ({ schemaId, holderDid, credentialData, expiresAt, signWithWallet }: {
    schemaId: string; holderDid: string; credentialData: Record<string, any>; expiresAt: string; signWithWallet: boolean;
  }) => {
    if (!user || !schemaId || !holderDid) return;
    try {
      let issuerSignature: string | null = null;
      let signerAddr: string | null = null;
      if (signWithWallet && walletAddress) {
        const message = `DecentraID Credential Issuance\nSchema: ${schemaId}\nHolder: ${holderDid}\nTimestamp: ${new Date().toISOString()}`;
        const sig = await signMessage(message);
        if (!sig) return;
        issuerSignature = sig;
        signerAddr = walletAddress;
      }

      const { data: session } = await supabase.auth.getSession();
      const authBearer = `Bearer ${session?.session?.access_token}`;

      if (!authBearer || authBearer === 'Bearer undefined') {
        toast({ title: "Error", description: "Not authenticated. Please sign in again.", variant: "destructive" });
        return;
      }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/issue-credential`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authBearer },
        body: JSON.stringify({
          schema_id: schemaId,
          holder_did: holderDid,
          credential_data: credentialData,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          issuer_signature: issuerSignature,
          signer_address: signerAddr,
        }),
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        let errorMsg = errorText;
        try { 
          const errObj = JSON.parse(errorText);
          errorMsg = errObj.error || errObj.details || errorText;
        } catch {}
        console.error("Issue credential error:", res.status, errorMsg);
        toast({ title: "Error", description: `Failed (${res.status}): ${errorMsg}`, variant: "destructive" });
        return;
      }
      
      const result = await res.json();
      if (result.error) { toast({ title: "Error", description: result.error, variant: "destructive" }); return; }

      const credData = result.credential;
const credHash = credData?.credential_hash;
      if (!credHash) { toast({ title: "Error", description: "Failed to get credential hash", variant: "destructive" }); return; }

      // Skip on-chain anchoring if contract not deployed
      if (!walletAddress || !isContractReady) {
        toast({ title: "Credential issued (off-chain)", description: "No wallet or contract - credential created without on-chain anchor." });
        loadData();
        return;
      }

      if (walletAddress && isContractReady) {
        // ── Browser wallet anchoring (MetaMask) ─────────────────────────────
        const anchorResult = await anchor(credHash);
        if (anchorResult.success) {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/anchor-credential`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: authBearer },
            body: JSON.stringify({
              credential_id: credData.id,
              tx_hash: anchorResult.txHash,
              block_number: anchorResult.blockNumber,
              from_address: anchorResult.from,
              anchored_at: Math.floor(Date.now() / 1000),
            }),
          });
          toast({
            title: "Credential issued & anchored on-chain ✓",
            description: `Block: #${anchorResult.blockNumber} · Tx: ${anchorResult.txHash?.substring(0, 18)}...`,
          });
        } else {
          toast({
            title: anchorResult.error?.includes("rejected") ? "Anchoring skipped" : "Anchoring failed",
            description: anchorResult.error?.includes("rejected")
              ? "Credential created. Anchor it later from the Blockchain Explorer."
              : anchorResult.error,
            variant: anchorResult.error?.includes("rejected") ? "default" : "destructive",
          });
        }
      } else if (!window.ethereum && isContractReady) {
        // ── Server wallet fallback (mobile / no MetaMask) ───────────────────
        toast({ title: "Anchoring via server wallet…", description: "No wallet detected — using server wallet to anchor on Ethereum Sepolia." });
        const serverRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/anchor-credential-server`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authBearer },
          body: JSON.stringify({ credential_id: credData.id, credential_hash: credHash }),
        });
        const serverResult = await serverRes.json();
        if (serverResult.success) {
          toast({
            title: "Credential issued & anchored on-chain ✓",
            description: `Block: #${serverResult.blockNumber} · Tx: ${serverResult.txHash?.substring(0, 18)}...`,
          });
        } else {
          toast({ title: "Server anchoring failed", description: serverResult.error ?? "Unknown error", variant: "destructive" });
        }
      } else {
        toast({
          title: "Credential created",
          description: isContractReady
            ? "Connect MetaMask to anchor on Ethereum Sepolia."
            : "Contract not deployed. Credential created without on-chain anchor.",
        });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    loadData();
  };

  // ── Revoke credential ──────────────────────────────────────────────
  const handleRevoke = async (credId: string) => {
    setRevokingId(credId);
    const cred = credentials.find((c) => c.id === credId);
    const credHash = cred?.credential_hash;

    if (credHash) {
      const success = await revokeOnChain(credHash, credId, user!.id);
      if (!success) { setRevokingId(null); return; }
    } else {
      try {
        await revokeCredentialDb(credId, user!.id);
        toast({ title: "Credential revoked" });
      } catch (err: any) {
        toast({ title: "Revocation failed", description: err.message, variant: "destructive" });
      }
    }
    setRevokingId(null);
    loadData();
  };

  return (
    <PortalLayout title="Issuer Portal" portalType="issuer" icon={<Shield className="h-5 w-5" style={{ color: "hsl(var(--issuer))" }} />} navItems={navItems}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] }}
        className="space-y-8"
      >
        {isLoading ? (
          <DashboardSkeleton stats={5} showCharts={currentView === "dashboard"} listItems={currentView === "schemas" ? 4 : 5} />
        ) : (
          <>
            {currentView === "dashboard" && <DashboardView schemas={schemas} credentials={credentials} />}
            {currentView === "schemas" && (
              <SchemasView
                schemas={schemas}
                credentials={credentials}
                onCreate={handleCreateSchema}
                onNewVersion={handleNewVersion}
                onMigrate={handleMigrate}
                onDelete={handleDeleteSchema}
              />
            )}
            {currentView === "issue" && (
              <IssueView
                schemas={schemas}
                credentials={credentials}
                walletAddress={walletAddress}
                isMetaMaskInstalled={isMetaMaskInstalled}
                anchorTxState={anchorTxState}
                revokingId={revokingId}
                onIssue={handleIssue}
                onRevoke={handleRevoke}
                onConnectWallet={connectWallet}
                onRefresh={loadData}
              />
            )}
          </>
        )}
      </motion.div>
    </PortalLayout>
  );
};

export default IssuerDashboard;
