import { useState, useMemo } from "react";
import { Send, Link2, Wallet, Loader2, CheckCircle2, XCircle, Users, QrCode } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import SchemaForm from "@/components/SchemaForm";
import BatchIssuanceDialog from "@/components/BatchIssuanceDialog";
import OID4VCIOfferDialog from "@/components/OID4VCIOfferDialog";
import CredentialDataGrid from "@/components/issuer/CredentialDataGrid";
import { motion, AnimatePresence } from "framer-motion";
import type { IssuerCredential, IssuerSchema } from "@/services/api/issuer.service";

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
  const [signWithWallet, setSignWithWallet] = useState(false);
  const [issuing, setIssuing] = useState(false);

  const selectedSchemaObj = useMemo(() => schemas.find((s) => s.id === selectedSchema), [schemas, selectedSchema]);
  const latestSchemas = schemas.filter((s) => s.is_latest);

  const handleIssue = async () => {
    setIssuing(true);
    await onIssue({ schemaId: selectedSchema, holderDid, credentialData, expiresAt, signWithWallet });
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Issue Verifiable Credential</DialogTitle>
            <DialogDescription>Create a new credential and optionally anchor it on-chain</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label>Holder DID</Label>
              <Input 
                value={holderDid} 
                onChange={(e) => setHolderDid(e.target.value)} 
                placeholder="did:decentraid:..." 
                className="input-solid"
              />
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
                  <SchemaForm fields={selectedSchemaObj.fields as any[]} value={credentialData} onChange={setCredentialData} />
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">
                Select a schema to see form fields
              </div>
            )}
            <div className="space-y-2">
              <Label>Expiration Date (optional)</Label>
              <Input 
                type="datetime-local" 
                value={expiresAt} 
                onChange={(e) => setExpiresAt(e.target.value)} 
                className="input-solid"
              />
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
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
              <Link2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{signWithWallet ? "Credential will be wallet-signed & anchored on Sepolia" : "Credential will be anchored on-chain with SHA-256 hash proof"}</span>
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
