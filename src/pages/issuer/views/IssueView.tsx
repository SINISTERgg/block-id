import { useState, useMemo } from "react";
import { Send, Link2, Wallet, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import SchemaForm from "@/components/SchemaForm";
import BatchIssuanceDialog from "@/components/BatchIssuanceDialog";
import OID4VCIOfferDialog from "@/components/OID4VCIOfferDialog";
import CredentialDataGrid from "@/components/issuer/CredentialDataGrid";
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

  const handleIssue = async () => {
    setIssuing(true);
    await onIssue({ schemaId: selectedSchema, holderDid, credentialData, expiresAt, signWithWallet });
    setIssuing(false);
    setIsIssueDialogOpen(false);
    setHolderDid(""); setCredentialData({}); setSelectedSchema(""); setExpiresAt("");
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-semibold text-foreground">Issue Credentials</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Issue credential card */}
        <Card className="border-dashed"><CardContent className="pt-6">
          <Dialog open={isIssueDialogOpen} onOpenChange={setIsIssueDialogOpen}>
            <DialogTrigger asChild>
              <button className="w-full text-left group">
                <div className="flex items-center gap-3 mb-2"><Send className="h-5 w-5 text-muted-foreground group-hover:text-issuer transition-colors" /><h3 className="font-display font-semibold text-foreground">Issue Credential</h3></div>
                <p className="text-sm text-muted-foreground">Issue with blockchain anchoring</p>
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display">Issue Verifiable Credential</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div><Label>Holder DID</Label><Input value={holderDid} onChange={(e) => setHolderDid(e.target.value)} placeholder="did:decentraid:..." /></div>
                <div>
                  <Label>Schema</Label>
                  <Select value={selectedSchema} onValueChange={(v) => { setSelectedSchema(v); setCredentialData({}); }}>
                    <SelectTrigger><SelectValue placeholder="Select schema" /></SelectTrigger>
                    <SelectContent>{schemas.filter((s) => s.is_latest).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} <span className="text-muted-foreground ml-1">v{s.version}</span></SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {selectedSchemaObj ? (
                  <SchemaForm fields={selectedSchemaObj.fields as any[]} value={credentialData} onChange={setCredentialData} />
                ) : (
                  <div className="text-xs text-muted-foreground text-center py-2">Select a schema to see form fields</div>
                )}
                <div><Label>Expiration Date (optional)</Label><Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></div>
                <div className="flex items-center justify-between bg-muted rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Sign with Wallet</p>
                      <p className="text-xs text-muted-foreground">{walletAddress ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}` : "Connect wallet first"}</p>
                    </div>
                  </div>
                  <Switch checked={signWithWallet} onCheckedChange={(checked) => { if (checked && !walletAddress) { onConnectWallet(); } else { setSignWithWallet(checked); } }} disabled={!isMetaMaskInstalled} />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
                  <Link2 className="h-3 w-3 shrink-0" />
                  <span>{signWithWallet ? "Credential will be wallet-signed & anchored on Polygon" : "Credential will be anchored on-chain with SHA-256 hash proof"}</span>
                </div>
                <Button variant="issuer" className="w-full" onClick={handleIssue} disabled={issuing || anchorTxState === "connecting" || anchorTxState === "signing" || anchorTxState === "mining"}>
                  {issuing ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {anchorTxState === "signing" ? "Confirm in MetaMask..." : anchorTxState === "mining" ? "Anchoring on-chain..." : "Creating credential..."}
                    </span>
                  ) : signWithWallet ? "Sign & Issue Credential" : "Issue & Anchor Credential"}
                </Button>
                {anchorTxState === "confirmed" && (
                  <div className="flex items-center gap-2 text-xs text-green-600 bg-green-500/10 rounded-lg p-2">
                    <CheckCircle2 className="h-3 w-3" /><span>Anchored on Polygon Amoy</span>
                  </div>
                )}
                {anchorTxState === "failed" && (
                  <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg p-2">
                    <XCircle className="h-3 w-3" /><span>Transaction failed. Credential was created.</span>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </CardContent></Card>

        <Card className="border-dashed"><CardContent className="pt-6"><BatchIssuanceDialog schemas={schemas} onComplete={onRefresh} /></CardContent></Card>
        <Card className="border-dashed"><CardContent className="pt-6"><OID4VCIOfferDialog schemas={schemas} /></CardContent></Card>
      </div>

      <CredentialDataGrid credentials={credentials} onRevoke={onRevoke} revokingId={revokingId} />
    </>
  );
};

export default IssueView;
