import { useState, useMemo } from "react";
import { Send, Link2, Wallet, Loader2, CheckCircle2, XCircle, Users, QrCode, Medal, FileJson, CalendarClock, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import SchemaForm from "@/components/SchemaForm";
import BatchIssuanceDialog from "@/components/BatchIssuanceDialog";
import OID4VCIOfferDialog from "@/components/OID4VCIOfferDialog";
import CredentialDataGrid from "@/components/issuer/CredentialDataGrid";
import HolderLookupInput from "@/components/issuer/HolderLookupInput";
import { CertificateSvg } from "@/components/issuer/CertificateRenderer";
import { useToast } from "@/hooks/use-toast";
import { canonicalJson } from "@/lib/crypto";
import {
  EXPIRY_PRESETS,
  NEVER_EXPIRES,
  describeExpiry,
  daysUntil,
  resolveExpiry,
  toLocalInputValue,
  type ExpirySelection,
} from "@/lib/expiry";
import { motion, AnimatePresence } from "framer-motion";
import type { IssuerCredential, IssuerSchema } from "@/services/api/issuer.service";
import { isSbtConfigured } from "@/services/blockchain/sbt.service";

interface IssueViewProps {
  schemas: IssuerSchema[];
  credentials: IssuerCredential[];
  walletAddress: string | null;
  isMetaMaskInstalled: boolean;
  anchorTxState: string | null;
  revokingId: string | null;
  onIssue: (params: {
    schemaId: string;
    holderDid: string;
    credentialData: Record<string, any>;
    expiresAt: string;
    signWithWallet: boolean;
    mintSbtBadge: boolean;
  }) => Promise<void>;
  onRevoke: (credId: string) => Promise<void>;
  onConnectWallet: () => void;
  onRefresh: () => void;
}

const IssueView = ({
  schemas,
  credentials,
  walletAddress,
  isMetaMaskInstalled,
  anchorTxState,
  revokingId,
  onIssue,
  onRevoke,
  onConnectWallet,
  onRefresh,
}: IssueViewProps) => {
  const [isIssueDialogOpen, setIsIssueDialogOpen] = useState(false);
  const [holderDid, setHolderDid] = useState("");
  const [selectedSchema, setSelectedSchema] = useState("");
  const [credentialData, setCredentialData] = useState<Record<string, any>>({});
  const [expiresAt, setExpiresAt] = useState("");
  /** Id of the preset that produced `expiresAt`; null once the issuer types their own. */
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [signWithWallet, setSignWithWallet] = useState(false);
  const [mintSbtBadge, setMintSbtBadge] = useState(true);
  const [issuing, setIssuing] = useState(false);

  const sbtConfigured = isSbtConfigured();
  const { toast } = useToast();

  const selectedSchemaObj = useMemo(() => schemas.find((s) => s.id === selectedSchema), [schemas, selectedSchema]);
  const latestSchemas = schemas.filter((s) => s.is_latest);

  /** Guess the holder's display name from whatever the form fields captured. */
  const previewHolderName = useMemo(() => {
    const subject = credentialData as Record<string, any>;
    const candidate =
      subject.name || subject.studentName || subject.employeeName || subject.holderName || subject.fullName;
    return typeof candidate === "string" && candidate.trim() ? candidate.trim() : "";
  }, [credentialData]);

  /** Mirror of the payload the edge function will build, for the JSON-LD tab. */
  const previewPayload = useMemo(() => {
    const schema = selectedSchemaObj as any;
    return {
      "@context": ["https://www.w3.org/2018/credentials/v1", "https://w3id.org/security/suites/ed25519-2020/v1"],
      type: ["VerifiableCredential", schema?.credential_type ?? "<credential_type>"],
      issuer: "did:decentraid:issuer:<your user id>",
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: holderDid || "<holder DID>",
        ...credentialData,
      },
      credentialSchema: {
        id: schema?.id ?? "<schema id>",
        type: schema?.credential_type ?? "<credential_type>",
        version: schema?.version ?? 1,
      },
      ...(expiresAt ? { expirationDate: new Date(expiresAt).toISOString() } : {}),
    };
  }, [selectedSchemaObj, holderDid, credentialData, expiresAt]);

  const previewCertificate = useMemo(
    () => ({
      credentialName: selectedSchemaObj?.name || "Credential",
      credentialType: selectedSchemaObj?.credential_type || "certificate",
      holderName: previewHolderName || "Credential Holder",
      holderDid: holderDid || "",
      issuedAt: new Date().toISOString(),
      status: "active",
      credentialHash: "pending — computed at issuance",
      blockchainAnchor: null,
      credentialData: credentialData as Record<string, any>,
    }),
    [selectedSchemaObj, previewHolderName, holderDid, credentialData],
  );

  /** The schema fields, with the issuer's constraints applied (Task 3.2). */
  const schemaFields = useMemo(
    () => (selectedSchemaObj ? (selectedSchemaObj.fields as any[]) : []),
    [selectedSchemaObj],
  );

  const applyExpiryPreset = (selection: ExpirySelection) => {
    const resolved = resolveExpiry(selection);
    setExpiresAt(resolved ? toLocalInputValue(resolved) : "");
    setActivePreset(selection === NEVER_EXPIRES ? NEVER_EXPIRES : selection.id);
  };

  const handleIssue = async () => {
    setIssuing(true);
    await onIssue({ schemaId: selectedSchema, holderDid, credentialData, expiresAt, signWithWallet, mintSbtBadge });
    setIssuing(false);
    setIsIssueDialogOpen(false);
    setHolderDid(""); setCredentialData({}); setSelectedSchema(""); setExpiresAt("");
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <h2 className="text-headline mb-2">Issue Credentials</h2>
        <p className="text-muted-foreground">Create and manage verifiable credentials with blockchain anchoring</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <Card className="solid-card overflow-hidden cursor-pointer" onClick={() => setIsIssueDialogOpen(true)}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-issuer rounded-lg flex items-center justify-center">
                  <Send className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Issue Credential</h3>
                  <p className="text-sm text-muted-foreground">Issue with blockchain anchoring</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <Card className="solid-card overflow-hidden">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-holder rounded-lg flex items-center justify-center">
                  <Users className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">Batch Issuance</h3>
                  <p className="text-sm text-muted-foreground mb-3">Issue multiple credentials</p>
                  <BatchIssuanceDialog schemas={schemas} onComplete={onRefresh} />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
        >
          <Card className="solid-card overflow-hidden">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-verifier rounded-lg flex items-center justify-center">
                  <QrCode className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">OID4VCI Offer</h3>
                  <p className="text-sm text-muted-foreground mb-3">Create QR code offer</p>
                  <OID4VCIOfferDialog schemas={schemas} />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Dialog open={isIssueDialogOpen} onOpenChange={setIsIssueDialogOpen}>
        <DialogContent className="sm:max-w-3xl flex flex-col max-h-[90vh] overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-display text-xl">Issue Verifiable Credential</DialogTitle>
            <DialogDescription>Create a new credential and optionally anchor it on-chain</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="form" className="flex flex-col min-h-0 flex-1">
            <TabsList className="shrink-0">
              <TabsTrigger value="form">Form Inputs</TabsTrigger>
              <TabsTrigger value="preview">Live Preview</TabsTrigger>
              <TabsTrigger value="jsonld">JSON-LD Payload</TabsTrigger>
            </TabsList>

            {/* ── Tab 1: form inputs ─────────────────────────────────── */}
            <TabsContent value="form" className="mt-4 space-y-5 overflow-y-auto pr-1">
              <div className="space-y-2">
                <Label>Holder</Label>
                <HolderLookupInput value={holderDid} onChange={setHolderDid} />
              </div>
              <div className="space-y-2">
                <Label>Schema</Label>
                <Select value={selectedSchema} onValueChange={(v) => { setSelectedSchema(v); setCredentialData({}); }}>
                  <SelectTrigger className="input-solid">
                    <SelectValue placeholder="Select a schema" />
                  </SelectTrigger>
                  <SelectContent>
                    {latestSchemas.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground">No schemas available</div>
                    ) : (
                      latestSchemas.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          <span className="font-medium">{s.name}</span>
                          <span className="text-muted-foreground ml-2">v{s.version}</span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              {selectedSchemaObj ? (
                <div className="space-y-2">
                  <Label>Credential Data</Label>
                  <div className="border border-border rounded-lg p-4 bg-muted/20">
                    <SchemaForm fields={schemaFields} value={credentialData} onChange={setCredentialData} />
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">
                  Select a schema to see form fields
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="credential-expires-at" className="flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" /> Expiration Date (optional)
                </Label>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Expiration presets">
                  {EXPIRY_PRESETS.map((p) => {
                    const isActive = activePreset === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        title={p.title}
                        aria-pressed={isActive}
                        onClick={() => applyExpiryPreset(p)}
                        className={`inline-flex items-center gap-1 border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                          isActive
                            ? "border-issuer bg-issuer text-issuer-foreground"
                            : "border-border text-muted-foreground hover:border-issuer hover:text-issuer"
                        }`}
                      >
                        {isActive && <Check className="h-3 w-3" />}
                        {p.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    title="Leave the credential without an expiration date"
                    aria-pressed={activePreset === NEVER_EXPIRES}
                    onClick={() => applyExpiryPreset(NEVER_EXPIRES)}
                    className={`inline-flex items-center gap-1 border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                      activePreset === NEVER_EXPIRES
                        ? "border-issuer bg-issuer text-issuer-foreground"
                        : "border-border text-muted-foreground hover:border-issuer hover:text-issuer"
                    }`}
                  >
                    {activePreset === NEVER_EXPIRES && <Check className="h-3 w-3" />}
                    Never
                  </button>
                </div>
                <Input
                  id="credential-expires-at"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => { setExpiresAt(e.target.value); setActivePreset(null); }}
                  className="input-solid"
                />
                {expiresAt ? (
                  <p data-testid="expiry-summary" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Check className="h-3 w-3 shrink-0 text-success" />
                    Expires <span className="text-foreground font-medium">{describeExpiry(expiresAt)}</span>
                    {daysUntil(expiresAt) !== null && (
                      <span className="text-muted-foreground/70">
                        ({daysUntil(expiresAt)} days from now)
                      </span>
                    )}
                  </p>
                ) : (
                  <p data-testid="expiry-summary" className="text-xs text-muted-foreground">
                    No expiration date — this credential will not expire.
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between bg-muted/50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
                    <Wallet className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Sign with Wallet</p>
                    <p className="text-xs text-muted-foreground">
                      {walletAddress ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}` : "Connect wallet first"}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={signWithWallet}
                  onCheckedChange={(checked) => {
                    if (checked && !walletAddress) { onConnectWallet(); }
                    else { setSignWithWallet(checked); }
                  }}
                  disabled={!isMetaMaskInstalled}
                />
              </div>
              {sbtConfigured && (
                <div className="flex items-center justify-between bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-amber-500/90 rounded-lg flex items-center justify-center">
                      <Medal className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Mint SBT Badge</p>
                      <p className="text-xs text-muted-foreground">Issue a soulbound token to the holder's wallet</p>
                    </div>
                  </div>
                  <Switch
                    id="mint-sbt-badge-toggle"
                    checked={mintSbtBadge}
                    onCheckedChange={setMintSbtBadge}
                  />
                </div>
              )}
            </TabsContent>

            {/* ── Tab 2: live certificate preview ────────────────────── */}
            <TabsContent value="preview" className="mt-4 overflow-y-auto pr-1 space-y-3">
              <p className="text-xs text-muted-foreground">
                Renders the exact certificate the holder will receive, updating as you type. The QR and hash
                are populated only after issuance.
              </p>
              <div className="rounded-xl overflow-hidden border border-border bg-slate-950">
                <CertificateSvg certificate={previewCertificate} />
              </div>
              {!holderDid && (
                <p className="text-xs text-warning">Pick a holder in the Form Inputs tab to preview against a real DID.</p>
              )}
            </TabsContent>

            {/* ── Tab 3: JSON-LD payload ────────────────────────────── */}
            <TabsContent value="jsonld" className="mt-4 space-y-3 overflow-y-auto pr-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <FileJson className="h-3.5 w-3.5" /> Canonical payload the edge function will anchor
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(canonicalJson(previewPayload));
                    toast({ title: "JSON-LD payload copied" });
                  }}
                >
                  Copy canonical JSON
                </Button>
              </div>
              <pre className="max-h-[45vh] overflow-auto rounded-lg border border-border bg-muted/30 p-4 font-mono text-[10px] leading-relaxed text-foreground">
                {JSON.stringify(previewPayload, null, 2)}
              </pre>
            </TabsContent>
          </Tabs>

          <div className="shrink-0 pt-4 space-y-3">
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
              <Link2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                {signWithWallet
                  ? "Credential will be wallet-signed & anchored on Sepolia"
                  : "Credential will be anchored on-chain with SHA-256 hash proof"}
                {sbtConfigured && mintSbtBadge && " · SBT badge will be minted"}
                {sbtConfigured && !mintSbtBadge && " · SBT badge skipped"}
              </span>
            </div>
            <Button
              className="w-full btn-primary"
              onClick={handleIssue}
              disabled={issuing || anchorTxState === "connecting" || anchorTxState === "signing" || anchorTxState === "mining" || latestSchemas.length === 0}
            >
              {issuing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {anchorTxState === "signing" ? "Confirm in MetaMask..." : anchorTxState === "mining" ? "Anchoring on-chain..." : "Creating credential..."}
                </span>
              ) : signWithWallet ? "Sign & Issue Credential" : "Issue & Anchor Credential"}
            </Button>
            <AnimatePresence>
              {anchorTxState === "confirmed" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 text-sm text-green-600 bg-green-500/10 rounded-lg p-3"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Anchored on Ethereum Sepolia</span>
                </motion.div>
              )}
              {anchorTxState === "failed" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3"
                >
                  <XCircle className="h-4 w-4" />
                  <span>Transaction failed. Credential was created.</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </DialogContent>
      </Dialog>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.3 }}
      >
        <CredentialDataGrid credentials={credentials} onRevoke={onRevoke} revokingId={revokingId} />
      </motion.div>
    </>
  );
};

export default IssueView;
