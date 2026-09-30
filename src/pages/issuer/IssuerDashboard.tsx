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
import { pinSchemaToIpfs } from "@/services/ipfs/ipfs.service";
import type { IssuerSchema, IssuerCredential, SchemaFieldDef } from "@/services/api/issuer.service";
import DashboardView from "./views/DashboardView";
import SchemasView from "./views/SchemasView";
import IssueView from "./views/IssueView";
import { MOTION } from "@/lib/motion";
import { supabase } from "@/integrations/supabase/client";
import {
  mintSbtForCredential,
  isSbtConfigured,
  resolveHolderAddress,
} from "@/services/blockchain/sbt.service";
import { SBT_NOT_DEPLOYED_HINT } from "@/services/blockchain/config";

const navItems = [
  { label: "Dashboard", path: "/issuer" },
  { label: "Schemas", path: "/issuer/schemas" },
  { label: "Issue", path: "/issuer/issue" },
];

const IssuerDashboard = () => {
  const location = useLocation();
  const currentView =
    location.pathname === "/issuer/schemas"
      ? "schemas"
      : location.pathname === "/issuer/issue"
      ? "issue"
      : "dashboard";

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

  // ── IPFS schema pinning (Phase 3) ──────────────────────────────────
  const [pinningSchemaId, setPinningSchemaId] = useState<string | null>(null);
  const handlePinToIpfs = async (schema: IssuerSchema) => {
    if (!user) return;
    setPinningSchemaId(schema.id);
    try {
      const result = await pinSchemaToIpfs(schema.id);
      toast({
        title: result.already_pinned ? "Already pinned to IPFS" : "Schema pinned to IPFS ✓",
        description: `CID: ${result.cid}`,
      });
      loadData();
    } catch (err: any) {
      toast({ title: "IPFS pinning failed", description: err.message, variant: "destructive" });
    } finally {
      setPinningSchemaId(null);
    }
  };

  // ── Issue credential ───────────────────────────────────────────────
  const handleIssue = async ({
    schemaId,
    holderDid,
    credentialData,
    expiresAt,
    signWithWallet,
    mintSbtBadge,
  }: {
    schemaId: string;
    holderDid: string;
    credentialData: Record<string, any>;
    expiresAt: string;
    signWithWallet: boolean;
    mintSbtBadge: boolean;
  }) => {
    if (!user || !schemaId || !holderDid) return;
    try {
      let issuerSignature: string | null = null;
      let signerAddr: string | null = null;
      if (signWithWallet) {
        if (!walletAddress) {
          toast({ title: "Wallet not connected", description: "Connect MetaMask first, then try again.", variant: "destructive" });
          return;
        }
        const message = `DecentraID Credential Issuance\nSchema: ${schemaId}\nHolder: ${holderDid}\nTimestamp: ${new Date().toISOString()}`;
        const sig = await signMessage(message);
        if (!sig) return; // user cancelled MetaMask signature
        issuerSignature = sig;
        signerAddr = walletAddress;
      }

      const { data: session } = await supabase.auth.getSession();
      const authBearer = `Bearer ${session?.session?.access_token}`;

      if (!authBearer || authBearer === "Bearer undefined") {
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
          // Persisted server-side so the holder portal can distinguish a badge
          // that was requested but never landed from one nobody asked for.
          sbt_requested: mintSbtBadge,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        let errorMsg = "";
        try {
          const errObj = JSON.parse(errorText);
          errorMsg = errObj.error || errObj.details || "";
        } catch {}
        console.error("Issue credential error:", res.status, errorMsg || errorText.slice(0, 240));
        toast({ title: "Error", description: `Failed (${res.status}): ${errorMsg || "Unexpected error"}`.slice(0, 300), variant: "destructive" });
        return;
      }

      const result = await res.json();
      if (result.error) { toast({ title: "Error", description: result.error, variant: "destructive" }); return; }

      const credData = result.credential;
      const credHash = credData?.credential_hash;
      if (!credHash) { toast({ title: "Error", description: "Failed to get credential hash", variant: "destructive" }); return; }

      // ── On-chain anchoring ───────────────────────────────────────────
      // Anchor first (it proves the credential is on the registry), then mint
      // the badge as its own step. The two used to be nested such that a
      // rejected anchor silently cancelled the badge.
      if (walletAddress && isContractReady) {
        // Browser wallet (MetaMask)
        const anchorResult = await anchor(credHash);
        if (anchorResult.success) {
          // Save the anchor record to Supabase (best-effort — tx is already on-chain)
          const anchorRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/anchor-credential`, {
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
          if (!anchorRes.ok) {
            const anchorErr = await anchorRes.json().catch(() => ({}));
            // 409 = already anchored — that's fine
            if (anchorRes.status !== 409) {
              console.warn("anchor-credential record failed:", anchorErr);
            }
          }
          toast({
            title: "Credential issued & anchored on-chain ✓",
            description: `Block: #${anchorResult.blockNumber} · Tx: ${anchorResult.txHash?.substring(0, 18)}...`,
          });
        } else {
          const errMsg = anchorResult.error ?? "";
          const isRejected = errMsg.includes("rejected") || errMsg.includes("denied");
          const isInsufficientFunds =
            errMsg.includes("insufficient funds") || errMsg.includes("insufficient_funds");

          if (isRejected) {
            toast({
              title: "Anchoring skipped",
              description: "Credential issued ✓ — you can anchor it on-chain later from the Blockchain Explorer.",
            });
          } else if (isInsufficientFunds) {
            toast({
              title: "Credential issued ✓ — Wallet needs Sepolia ETH",
              description:
                "Your wallet has insufficient Sepolia ETH for gas fees. Get free testnet ETH at " +
                "faucet.sepolia.dev or sepoliafaucet.com, then anchor from the Blockchain Explorer.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Anchoring failed",
              description: `Credential issued ✓ — on-chain anchor failed: ${errMsg}`,
              variant: "destructive",
            });
          }
        }
      } else if (!window.ethereum && isContractReady) {
        // Server wallet fallback (mobile / no MetaMask)
        toast({ title: "Anchoring via server wallet…", description: "No wallet detected — using server wallet to anchor on Ethereum Sepolia." });
        const serverRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/anchor-credential-server`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authBearer },
          body: JSON.stringify({ credential_id: credData.id, credential_hash: credHash }),
        });
        const serverResult = await serverRes.json().catch(() => null);
        if (serverResult?.success) {
          toast({
            title: "Credential issued & anchored on-chain ✓",
            description: `Block: #${serverResult.blockNumber} · Tx: ${serverResult.txHash?.substring(0, 18)}...`,
          });
        } else {
          toast({ title: "Server anchoring failed", description: (serverResult?.error ?? "Unexpected error").slice(0, 240), variant: "destructive" });
        }
      } else {
        toast({
          title: "Credential issued (off-chain)",
          description: isContractReady
            ? "Connect MetaMask to anchor on Ethereum Sepolia."
            : "Contract not deployed. Credential created without on-chain anchor.",
        });
      }

      // ── Soulbound badge mint ─────────────────────────────────────────
      // Runs regardless of the anchor outcome, and reports its own result
      // instead of failing silently. The badge is minted to the HOLDER's
      // address — never the issuer's.
      if (mintSbtBadge) {
        await mintAndRecordBadge({
          credentialId: credData.id,
          credentialHash: credHash,
          holderDid: credData.holder_did ?? holderDid,
          fallbackAddress: credData.holder_wallet_address ?? null,
          authBearer,
        });
      }

      loadData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  /**
   * Mint the holder's SBT badge, then persist the token id so the holder portal
   * and the verifier SBT read paths can find it.
   */
  const mintAndRecordBadge = async ({
    credentialId,
    credentialHash,
    holderDid,
    fallbackAddress,
    authBearer,
  }: {
    credentialId: string;
    credentialHash: string;
    holderDid: string;
    fallbackAddress: string | null;
    authBearer: string;
  }): Promise<void> => {
    if (!isSbtConfigured()) {
      toast({
        title: "Badge skipped — contract not configured",
        description: SBT_NOT_DEPLOYED_HINT,
        variant: "destructive",
      });
      return;
    }

    const holder = resolveHolderAddress(holderDid, fallbackAddress);
    if (!holder) {
      toast({
        title: "Badge skipped — no holder wallet",
        description:
          "This holder DID is not an Ethereum DID and no wallet address is on file, so there is nowhere to mint the badge.",
        variant: "destructive",
      });
      return;
    }

    if (!window.ethereum) {
      toast({
        title: "Badge skipped — no wallet",
        description: "Minting a soulbound badge requires MetaMask so the issuer can sign the transaction.",
        variant: "destructive",
      });
      return;
    }

    let sbtResult;
    try {
      const { BrowserProvider } = await import("ethers");
      const browserProvider = new BrowserProvider(window.ethereum!);
      const signer = await browserProvider.getSigner();
      sbtResult = await mintSbtForCredential(signer as any, {
        credentialHash,
        holderDid,
        fallbackAddress,
      });
    } catch (sbtErr: any) {
      const reason = (sbtErr as { reason?: string }).reason;
      console.error("SBT mint failed:", sbtErr);

      // Persist the failure so the holder portal can show a pending badge
      // rather than silently omitting it.
      if (reason !== "rejected") {
        await supabase
          .from("credentials")
          .update({ sbt_status: "failed" })
          .eq("id", credentialId)
          .then(() => undefined, () => undefined);
      }

      toast({
        title: reason === "rejected" ? "Badge mint declined" : "Badge mint failed",
        description: sbtErr?.message?.slice(0, 260) ?? "Unknown error",
        variant: reason === "rejected" ? undefined : "destructive",
      });
      return;
    }

    // Persist the token id — this is what makes the badge visible in the
    // holder portal. Without it the mint is invisible to every reader.
    //
    // When tokenId is null (e.g. Minted log was absent from the receipt or
    // eth_getTransactionReceipt hasn't finalised yet), pass verify_on_chain=true
    // so the edge function reads tokenByCredentialHash from the contract directly,
    // resolving the id without requiring a client-side re-decode.
    try {
      const recordBody: Record<string, unknown> = {
        credential_id: credentialId,
        tx_hash: sbtResult.txHash,
        holder_address: sbtResult.holder,
        status: "minted",
        // Always ask the edge function to cross-check: it will self-heal a
        // null tokenId by reading the contract, and validate a non-null one.
        verify_on_chain: true,
      };
      if (sbtResult.tokenId !== null) {
        recordBody.token_id = Number(sbtResult.tokenId);
      }
      // else: omit token_id — the edge function will read it from the chain

      const recordRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/record-sbt`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authBearer },
        body: JSON.stringify(recordBody),
      });

      if (!recordRes.ok) {
        const errBody = await recordRes.json().catch(() => ({}));
        console.warn("record-sbt failed:", recordRes.status, errBody);

        // Gracefully surface which token the badge landed on if we know
        const tokenLabel = sbtResult.tokenId !== null ? `token #${sbtResult.tokenId}` : "an on-chain token";
        toast({
          title: `Badge minted (${tokenLabel}) but not recorded`,
          description:
            errBody?.error?.slice(0, 180) ??
            "The badge is on-chain, but saving its token id failed. Run `node scripts/reconcile-sbt.js --write` to backfill it.",
          variant: "destructive",
        });
        return;
      }

      const recorded = await recordRes.json().catch(() => ({}));
      // If the edge function resolved a token id that the client missed, use that
      const resolvedTokenId = recorded?.sbt_token_id ?? sbtResult.tokenId;
      toast({
        title: "Badge minted ✓",
        description: `Token #${resolvedTokenId ?? "?"} → ${sbtResult.holder.slice(0, 10)}… · Tx: ${sbtResult.txHash?.substring(0, 14)}...`,
      });
      return; // early return: toast already emitted above
    } catch (recordErr) {
      console.warn("record-sbt request failed:", recordErr);
      toast({
        title: `Badge minted (token #${sbtResult.tokenId ?? "?"}) but not recorded`,
        description: "The badge is on-chain, but saving its token id failed. Run `node scripts/reconcile-sbt.js --write` to backfill it.",
        variant: "destructive",
      });
      return;
    }
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
    <PortalLayout title="Issuer Portal" portalType="issuer" icon={<Shield className="h-5 w-5" />} navItems={navItems}>
      <motion.div
        initial={{ opacity: 0, y: MOTION.DISTANCE }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: MOTION.DURATION, ease: MOTION.EASE }}
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
                onPinToIpfs={handlePinToIpfs}
                pinningSchemaId={pinningSchemaId}
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
