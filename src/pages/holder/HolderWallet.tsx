import { useState, useCallback, useEffect, useMemo } from "react";
import { User, QrCode, Share2, Shield, Copy, TrendingUp, Download, Link2, Clock, ExternalLink } from "lucide-react";
import OnChainStatusBadge from "@/components/OnChainStatusBadge";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import PortalLayout from "@/components/layout/PortalLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import QRCodeDisplay from "@/components/QRCodeDisplay";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useCredentialNotifications } from "@/hooks/useCredentialNotifications";
import { generateCertificatePdf } from "@/lib/generateCertificatePdf";
import ShareCredentialDialog from "@/components/ShareCredentialDialog";
import Web3WalletCard from "@/components/Web3WalletCard";
import ActiveShareLinks from "@/components/ActiveShareLinks";
import CredentialExport from "@/components/CredentialExport";
import PrivacyCenter from "@/components/PrivacyCenter";
import DashboardSkeleton from "@/components/ui/DashboardSkeleton";

const navItems = [
  { label: "Wallet", path: "/holder" },
  { label: "Present", path: "/holder/present" },
];

interface Credential {
  id: string;
  credential_data: any;
  credential_hash: string;
  blockchain_anchor: string | null;
  status: string;
  issued_at: string;
  credential_schemas: { name: string; credential_type: string } | null;
}

const HolderWallet = () => {
  const location = useLocation();
  const currentView = location.pathname === "/holder/present" ? "present" : "wallet";

  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [qrValue, setQrValue] = useState("");
  const [qrTitle, setQrTitle] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [shareCredId, setShareCredId] = useState<string | null>(null);
  const [shareCredName, setShareCredName] = useState("");
  const [shareCredFields, setShareCredFields] = useState<string[]>([]);
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  useCredentialNotifications();

  const fetchCredentials = async () => {
    if (!user) return;
    setIsLoading(true);
    const { data } = await supabase
      .from("credentials")
      .select("id, credential_data, credential_hash, blockchain_anchor, status, issued_at, credential_schemas(name, credential_type)")
      .eq("holder_id", user.id)
      .order("issued_at", { ascending: false });
    if (data) setCredentials(data as any);
    setIsLoading(false);
  };

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    fetchCredentials();
    const channel = supabase
      .channel("holder-credentials")
      .on("postgres_changes", { event: "*", schema: "public", table: "credentials" }, () => fetchCredentials())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const generateDid = async () => {
    if (!user || profile?.did) return;
    const { data, error } = await supabase.rpc("generate_did", { _user_id: user.id });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "DID Generated", description: data as string });
    await refreshProfile();
  };

  const showQR = (value: string, title: string) => { setQrValue(value); setQrTitle(title); setQrOpen(true); };
  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text); toast({ title: "Copied to clipboard" }); };

  const createPresentation = (cred: Credential) => JSON.stringify({
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiablePresentation"],
    holder: profile?.did,
    verifiableCredential: { ...cred.credential_data, id: cred.id },
    credential_id: cred.id,
  });

  // Analytics
  const activeCount = credentials.filter(c => c.status === "active").length;
  const revokedCount = credentials.filter(c => c.status === "revoked").length;
  const expiredCount = credentials.filter(c => c.status === "expired").length;
  const statusData = useMemo(() => [
    { name: "Active", value: activeCount },
    { name: "Revoked", value: revokedCount },
    { name: "Expired", value: expiredCount },
  ].filter(d => d.value > 0), [activeCount, revokedCount, expiredCount]);

  const securityScore = useMemo(() => {
    let score = 0;
    if (profile?.did) score += 50;
    if (credentials.length > 0) score += 50;
    return score;
  }, [profile, credentials]);

  const activeCredentials = credentials.filter(c => c.status === "active");

  const renderWallet = () => (
    <>
      {/* Security & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-holder-muted flex items-center justify-center">
                <Shield className="h-5 w-5" style={{ color: "hsl(var(--holder))" }} />
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-foreground">{securityScore}%</p>
                <p className="text-sm text-muted-foreground">Security Score</p>
              </div>
            </div>
            <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${securityScore}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-holder-muted flex items-center justify-center"><TrendingUp className="h-5 w-5" style={{ color: "hsl(var(--holder))" }} /></div><div><p className="text-2xl font-display font-bold text-foreground">{credentials.length}</p><p className="text-sm text-muted-foreground">Total Credentials</p></div></div></CardContent></Card>
        <Card>
          <CardContent className="pt-6">
            {statusData.length > 0 ? (
              <div className="flex items-center gap-3">
                <div className="w-16 h-16">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart><Pie data={statusData} dataKey="value" cx="50%" cy="50%" outerRadius={28} innerRadius={16}>{statusData.map((_, i) => <Cell key={i} fill={i === 0 ? "hsl(175, 60%, 38%)" : "hsl(0, 72%, 51%)"} />)}</Pie></PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-xs space-y-1">
                  <p className="text-foreground"><span className="font-semibold">{activeCount}</span> active</p>
                  {revokedCount > 0 && <p className="text-destructive"><span className="font-semibold">{revokedCount}</span> revoked</p>}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-holder-muted flex items-center justify-center"><QrCode className="h-5 w-5" style={{ color: "hsl(var(--holder))" }} /></div><div><p className="text-2xl font-display font-bold text-foreground">0</p><p className="text-sm text-muted-foreground">Credentials</p></div></div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* DID Card */}
      <Card className="border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground mb-1">Your Decentralized Identifier</p>
              {profile?.did ? (
                <div className="flex items-center gap-2">
                  <p className="font-mono text-sm text-foreground break-all">{profile.did}</p>
                  <button onClick={() => copyToClipboard(profile.did!)} className="shrink-0"><Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" /></button>
                </div>
              ) : (
                <Button variant="holder" size="sm" onClick={generateDid}>Generate DID</Button>
              )}
            </div>
            {profile?.did && (
              <button onClick={() => showQR(profile.did!, "Your DID")}>
                <QrCode className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors cursor-pointer" />
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Web3 Wallet */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Web3WalletCard userId={user?.id} />
      </div>

      {/* Credentials */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-display text-lg">My Credentials</CardTitle>
          <Shield className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {credentials.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No credentials yet. Credentials issued to your DID will appear here.</div>
          ) : (
            <div className="space-y-4">
              {credentials.map((cred) => (
                <div key={cred.id} className={`border rounded-lg p-4 ${cred.status === "revoked" ? "border-destructive/30 opacity-60" : cred.status === "expired" ? "border-muted opacity-60" : "border-border/60"}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-display font-semibold text-foreground">{cred.credential_schemas?.name || "Credential"}</h4>
                      <p className="text-xs text-muted-foreground">{cred.credential_schemas?.credential_type}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {cred.status === "active" && (
                        <>
                          <button onClick={() => showQR(createPresentation(cred), "Credential QR")}><QrCode className="h-4 w-4 text-muted-foreground hover:text-primary" /></button>
                          <button onClick={() => copyToClipboard(createPresentation(cred))}><Share2 className="h-4 w-4 text-muted-foreground hover:text-primary" /></button>
                          <button title="Generate share link" onClick={() => {
                            setShareCredId(cred.id);
                            setShareCredName(cred.credential_schemas?.name || "Credential");
                            const subject = (cred.credential_data as any)?.credentialSubject;
                            setShareCredFields(subject ? Object.keys(subject) : []);
                          }}>
                            <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                          </button>
                        </>
                      )}
                      <CredentialExport credential={cred} holderDid={profile?.did || ""} />
                      <button
                        title="Download PDF Certificate"
                        onClick={() => generateCertificatePdf({
                          credentialName: cred.credential_schemas?.name || "Credential",
                          credentialType: cred.credential_schemas?.credential_type || "",
                          holderName: profile?.full_name || "",
                          holderDid: profile?.did || "",
                          issuedAt: cred.issued_at,
                          status: cred.status,
                          credentialHash: cred.credential_hash,
                          blockchainAnchor: cred.blockchain_anchor,
                          credentialData: cred.credential_data as Record<string, any>,
                        })}
                      >
                        <Download className="h-4 w-4 text-muted-foreground hover:text-primary" />
                      </button>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        cred.status === "active" ? "bg-accent text-accent-foreground" :
                        cred.status === "expired" ? "bg-muted text-muted-foreground" :
                        "bg-destructive/10 text-destructive"
                      }`}>{cred.status}</span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Issued: {new Date(cred.issued_at).toLocaleDateString()}</p>
                    {(cred.credential_data as any)?.expirationDate && (
                      <p className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Expires: {new Date((cred.credential_data as any).expirationDate).toLocaleDateString()}
                      </p>
                    )}
                    {cred.blockchain_anchor && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-mono flex items-center gap-1">
                          <Link2 className="h-3 w-3 text-primary" />
                          <span className="text-primary">⛓</span> {cred.blockchain_anchor}
                        </p>
                        <OnChainStatusBadge
                          credentialId={cred.id}
                          credentialData={cred.credential_data}
                          blockchainAnchor={cred.blockchain_anchor}
                        />
                      </div>
                    )}
                    {(cred.credential_data as any)?.blockchain && (
                      <p className="font-mono text-primary">
                        Tx: {(cred.credential_data as any).blockchain.txHash?.substring(0, 22)}... Block #{(cred.credential_data as any).blockchain.blockNumber}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );

  const renderPresent = () => (
    <>
      <h2 className="text-xl font-display font-semibold text-foreground">Present Credentials</h2>

      {activeCredentials.length === 0 ? (
        <Card><CardContent className="py-12"><div className="flex items-center justify-center text-muted-foreground text-sm">No active credentials to present.</div></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {activeCredentials.map((cred) => (
            <Card key={cred.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-display font-semibold text-foreground">{cred.credential_schemas?.name || "Credential"}</h4>
                    <p className="text-xs text-muted-foreground">{cred.credential_schemas?.credential_type}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground">active</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => showQR(createPresentation(cred), cred.credential_schemas?.name || "Credential")}>
                    <QrCode className="h-3 w-3" /> Show QR
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => copyToClipboard(createPresentation(cred))}>
                    <Share2 className="h-3 w-3" /> Copy VP
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => {
                    setShareCredId(cred.id);
                    setShareCredName(cred.credential_schemas?.name || "Credential");
                    const subject = (cred.credential_data as any)?.credentialSubject;
                    setShareCredFields(subject ? Object.keys(subject) : []);
                  }}>
                    <ExternalLink className="h-3 w-3" /> Share Link
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Active Share Links */}
      <ActiveShareLinks />

      {/* Privacy Center */}
      <PrivacyCenter />
    </>
  );

  return (
    <PortalLayout title="Holder Wallet" portalType="holder" icon={<User className="h-5 w-5" style={{ color: "hsl(var(--holder))" }} />} navItems={navItems}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] }}
        className="space-y-8"
      >
        {isLoading ? <DashboardSkeleton stats={3} showCharts={false} listItems={currentView === "wallet" ? 4 : 3} /> : (
          <>
            {currentView === "wallet" && renderWallet()}
            {currentView === "present" && renderPresent()}
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
