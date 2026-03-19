import { useState, useEffect, useMemo } from "react";
import { Building2, Search, CheckCircle2, XCircle, Clock, Share2, Brain, TrendingUp, BarChart3, Link2, ShieldCheck, PenTool, ScanLine } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import PortalLayout from "@/components/layout/PortalLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import TrustedIssuerRegistry from "@/components/TrustedIssuerRegistry";
import DIDResolver from "@/components/DIDResolver";
import OID4VPRequestDialog from "@/components/OID4VPRequestDialog";
import DashboardSkeleton from "@/components/ui/DashboardSkeleton";

const navItems = [
  { label: "Dashboard", path: "/verifier" },
  { label: "Verify", path: "/verifier/verify" },
  { label: "History", path: "/verifier/history" },
];

interface VerificationRecord {
  id: string;
  holder_did: string | null;
  credential_type: string | null;
  purpose: string;
  status: string;
  ai_analysis: any;
  verified_at: string | null;
  created_at: string;
}

const CHART_COLORS = ["hsl(175, 60%, 38%)", "hsl(0, 72%, 51%)", "hsl(45, 80%, 55%)"];

const VerifierDashboard = () => {
  const location = useLocation();
  const currentView = location.pathname === "/verifier/verify" ? "verify" : location.pathname === "/verifier/history" ? "history" : "dashboard";

  const [isVerifyDialogOpen, setIsVerifyDialogOpen] = useState(false);
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [vpJson, setVpJson] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [records, setRecords] = useState<VerificationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [requestDid, setRequestDid] = useState("");
  const [requestType, setRequestType] = useState("");
  const [requestPurpose, setRequestPurpose] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchRecords = async () => {
    if (!user) return;
    setIsLoading(true);
    const { data } = await supabase
      .from("verification_requests")
      .select("*")
      .eq("verifier_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (data) setRecords(data as any);
    setIsLoading(false);
  };

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    fetchRecords();
  }, [user]);

  const verifyCredential = async () => {
    if (!vpJson.trim()) return;
    setVerifying(true);
    setVerificationResult(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      let body: any = {};
      try {
        const parsed = JSON.parse(vpJson);
        if (parsed.credential_id) body.credential_id = parsed.credential_id;
        else body.vp_json = parsed;
      } catch { body.vp_json = vpJson; }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-credential`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.session?.access_token}` },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (result.error) {
        toast({ title: "Verification failed", description: result.error, variant: "destructive" });
      } else {
        setVerificationResult(result);
        toast({ title: result.valid ? "Credential Valid ✓" : "Credential Invalid ✗" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to verify", variant: "destructive" });
    }
    setVerifying(false);
    fetchRecords();
  };

  const sendRequest = async () => {
    if (!user || !requestDid) return;
    const { error } = await supabase.from("verification_requests").insert({
      verifier_id: user.id, holder_did: requestDid, credential_type: requestType || null, purpose: requestPurpose, status: "pending",
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Request sent" });
    setIsRequestDialogOpen(false);
    setRequestDid(""); setRequestType(""); setRequestPurpose("");
    fetchRecords();
  };

  const verified = records.filter(r => r.status === "verified").length;
  const pending = records.filter(r => r.status === "pending").length;
  const rejected = records.filter(r => r.status === "rejected").length;

  const statusDistribution = useMemo(() => [
    { name: "Verified", value: verified },
    { name: "Rejected", value: rejected },
    { name: "Pending", value: pending },
  ].filter(d => d.value > 0), [verified, rejected, pending]);

  const monthlyVerifications = useMemo(() => {
    const map: Record<string, number> = {};
    records.forEach(r => { const month = new Date(r.created_at).toLocaleDateString("en-US", { month: "short", year: "2-digit" }); map[month] = (map[month] || 0) + 1; });
    return Object.entries(map).map(([month, count]) => ({ month, count })).reverse().slice(-6);
  }, [records]);

  const aiAnalyzedCount = records.filter(r => r.ai_analysis).length;
  const avgConfidence = useMemo(() => {
    const analyzed = records.filter(r => r.ai_analysis?.confidence);
    if (analyzed.length === 0) return 0;
    return Math.round(analyzed.reduce((sum, r) => sum + r.ai_analysis.confidence, 0) / analyzed.length);
  }, [records]);

  const renderDashboard = () => (
    <>
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-verifier-muted flex items-center justify-center"><CheckCircle2 className="h-5 w-5" style={{ color: "hsl(var(--verifier))" }} /></div><div><p className="text-2xl font-display font-bold text-foreground">{verified}</p><p className="text-sm text-muted-foreground">Verified</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-verifier-muted flex items-center justify-center"><Clock className="h-5 w-5" style={{ color: "hsl(var(--verifier))" }} /></div><div><p className="text-2xl font-display font-bold text-foreground">{pending}</p><p className="text-sm text-muted-foreground">Pending</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-verifier-muted flex items-center justify-center"><XCircle className="h-5 w-5" style={{ color: "hsl(var(--verifier))" }} /></div><div><p className="text-2xl font-display font-bold text-foreground">{rejected}</p><p className="text-sm text-muted-foreground">Rejected</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-verifier-muted flex items-center justify-center"><Brain className="h-5 w-5" style={{ color: "hsl(var(--verifier))" }} /></div><div><p className="text-2xl font-display font-bold text-foreground">{aiAnalyzedCount > 0 ? `${avgConfidence}%` : "—"}</p><p className="text-sm text-muted-foreground">AI Confidence</p></div></div></CardContent></Card>
      </div>

      {/* Analytics */}
      {records.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="font-display text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" style={{ color: "hsl(var(--verifier))" }} /> Verification Trend</CardTitle></CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyVerifications}>
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" fill="hsl(var(--verifier))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="font-display text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" style={{ color: "hsl(var(--verifier))" }} /> Results Distribution</CardTitle></CardHeader>
            <CardContent>
              <div className="h-48 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={11}>
                      {statusDistribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Trust Infrastructure */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DIDResolver compact />
        <TrustedIssuerRegistry compact />
      </div>
    </>
  );

  const renderVerify = () => (
    <>
      <h2 className="text-xl font-display font-semibold text-foreground">Verify Credentials</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-dashed"><CardContent className="pt-6">
          <Dialog open={isVerifyDialogOpen} onOpenChange={(o) => { setIsVerifyDialogOpen(o); if (!o) setVerificationResult(null); }}>
            <DialogTrigger asChild>
              <button className="w-full text-left group">
                <div className="flex items-center gap-3 mb-2"><Search className="h-5 w-5 text-muted-foreground group-hover:text-verifier transition-colors" /><h3 className="font-display font-semibold text-foreground">Verify Credential</h3></div>
                <p className="text-sm text-muted-foreground">Paste a VP to check validity with AI analysis</p>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle className="font-display">Verify Credential</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Verifiable Presentation (JSON)</Label>
                  <Textarea value={vpJson} onChange={e => setVpJson(e.target.value)} placeholder="Paste the VP JSON here..." rows={6} className="font-mono text-xs" />
                </div>
                <Button variant="verifier" className="w-full" onClick={verifyCredential} disabled={verifying}>
                  {verifying ? "Verifying with AI..." : "Verify"}
                </Button>
                {verificationResult && (
                  <div className="space-y-3 border-t border-border pt-4">
                    <div className="flex items-center gap-2">
                      {verificationResult.valid ? <CheckCircle2 className="h-5 w-5 text-accent-foreground" /> : <XCircle className="h-5 w-5 text-destructive" />}
                      <span className="font-display font-semibold">{verificationResult.valid ? "Valid Credential" : "Invalid Credential"}</span>
                    </div>
                    <div className="text-xs space-y-1 text-muted-foreground">
                      <p>Hash Integrity: {verificationResult.hash_integrity ? "✓ Valid" : "✗ Tampered"}</p>
                      <p>Not Revoked: {verificationResult.not_revoked ? "✓ Active" : "✗ Revoked"}</p>
                      <p>Not Expired: {verificationResult.not_expired !== undefined ? (verificationResult.not_expired ? "✓ Valid" : "✗ Expired") : "✓ No expiry"}</p>
                      {verificationResult.expires_at && <p>Expires: {new Date(verificationResult.expires_at).toLocaleDateString()}</p>}
                      {verificationResult.blockchain_anchor && (
                        <p className="font-mono flex items-center gap-1"><Link2 className="h-3 w-3 text-primary" /> Anchor: {verificationResult.blockchain_anchor}</p>
                      )}
                      {verificationResult.blockchain_info && (
                        <div className="bg-muted rounded p-2 mt-1">
                          <p className="font-mono text-primary">⛓ Blockchain Verified</p>
                          <p className="font-mono">Tx: {verificationResult.blockchain_info.txHash?.substring(0, 22)}...</p>
                          <p className="font-mono">Block: #{verificationResult.blockchain_info.blockNumber}</p>
                          <p className="font-mono">Network: {verificationResult.blockchain_info.network}</p>
                        </div>
                      )}
                      {verificationResult.signature && (
                        <div className="bg-muted rounded p-2 mt-1">
                          <p className="font-mono flex items-center gap-1">
                            <PenTool className="h-3 w-3" />
                            {verificationResult.signature.signed ? (
                              <span className="text-accent-foreground">✓ Wallet Signed ({verificationResult.signature.type})</span>
                            ) : (
                              <span className="text-muted-foreground">Simulated proof ({verificationResult.signature.type})</span>
                            )}
                          </p>
                          {verificationResult.signature.signer && (
                            <p className="font-mono text-xs">Signer: {verificationResult.signature.signer}</p>
                          )}
                        </div>
                      )}
                    </div>
                    {verificationResult.ai_analysis && (
                      <div className="bg-muted rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Brain className="h-4 w-4 text-primary" />
                          <span className="text-sm font-display font-medium">AI Analysis</span>
                        </div>
                        <div className="text-xs space-y-1">
                          <p>Risk Level: <span className={`font-semibold ${verificationResult.ai_analysis.risk_level === "low" ? "text-accent-foreground" : verificationResult.ai_analysis.risk_level === "high" ? "text-destructive" : "text-foreground"}`}>{verificationResult.ai_analysis.risk_level}</span></p>
                          <p>Confidence: {verificationResult.ai_analysis.confidence}%</p>
                          {verificationResult.ai_analysis.findings?.map((f: string, i: number) => (
                            <p key={i} className="text-muted-foreground">• {f}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </CardContent></Card>

        <Card className="border-dashed"><CardContent className="pt-6">
          <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
            <DialogTrigger asChild>
              <button className="w-full text-left group">
                <div className="flex items-center gap-3 mb-2"><Share2 className="h-5 w-5 text-muted-foreground group-hover:text-verifier transition-colors" /><h3 className="font-display font-semibold text-foreground">Request Presentation</h3></div>
                <p className="text-sm text-muted-foreground">Request specific credentials from a holder</p>
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display">Request Presentation</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div><Label>Holder DID</Label><Input value={requestDid} onChange={e => setRequestDid(e.target.value)} placeholder="did:decentraid:..." /></div>
                <div><Label>Required Credential Type</Label>
                  <Select value={requestType} onValueChange={setRequestType}><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger><SelectContent><SelectItem value="degree">Degree</SelectItem><SelectItem value="diploma">Diploma</SelectItem><SelectItem value="certificate">Certificate</SelectItem><SelectItem value="transcript">Transcript</SelectItem></SelectContent></Select>
                </div>
                <div><Label>Purpose</Label><Input value={requestPurpose} onChange={e => setRequestPurpose(e.target.value)} placeholder="e.g., Employment verification" /></div>
                <Button variant="verifier" className="w-full" onClick={sendRequest}>Send Request</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent></Card>

        <Card className="border-dashed"><CardContent className="pt-6">
          <OID4VPRequestDialog />
        </CardContent></Card>
      </div>
    </>
  );

  const renderHistory = () => (
    <>
      <h2 className="text-xl font-display font-semibold text-foreground">Verification History</h2>
      <Card>
        <CardContent className="pt-6">
          {records.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No verifications yet.</div>
          ) : (
            <div className="space-y-3">
              {records.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{r.credential_type || "Credential"} {r.purpose && `— ${r.purpose}`}</p>
                    {r.holder_did && <p className="text-xs text-muted-foreground font-mono">{r.holder_did.substring(0, 30)}...</p>}
                  </div>
                  <div className="text-right flex items-center gap-2">
                    {r.ai_analysis && <Brain className="h-3 w-3 text-primary" />}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === "verified" ? "bg-accent text-accent-foreground" : r.status === "rejected" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>{r.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );

  return (
    <PortalLayout title="Verifier Portal" portalType="verifier" icon={<Building2 className="h-5 w-5" style={{ color: "hsl(var(--verifier))" }} />} navItems={navItems}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] }}
        className="space-y-8"
      >
        {isLoading ? <DashboardSkeleton stats={4} showCharts={currentView === "dashboard"} listItems={currentView === "history" ? 5 : 3} /> : (
          <>
            {currentView === "dashboard" && renderDashboard()}
            {currentView === "verify" && renderVerify()}
            {currentView === "history" && renderHistory()}
          </>
        )}
      </motion.div>
    </PortalLayout>
  );
};

export default VerifierDashboard;
