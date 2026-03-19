import { useState, useEffect, useMemo } from "react";
import { Shield, FileText, Users, Plus, Send, Ban, BarChart3, TrendingUp, Link2, Calendar, Wallet, ScrollText, GitBranch, Smartphone, Trash2, ArrowRightLeft, Loader2, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import PortalLayout from "@/components/layout/PortalLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import SchemaForm from "@/components/SchemaForm";
import BatchIssuanceDialog from "@/components/BatchIssuanceDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useWeb3Wallet } from "@/hooks/useWeb3Wallet";
import TrustedIssuerRegistry from "@/components/TrustedIssuerRegistry";
import OID4VCIOfferDialog from "@/components/OID4VCIOfferDialog";
import DashboardSkeleton from "@/components/ui/DashboardSkeleton";

const navItems = [
  { label: "Dashboard", path: "/issuer" },
  { label: "Schemas", path: "/issuer/schemas" },
  { label: "Issue", path: "/issuer/issue" },
];

interface Schema {
  id: string;
  name: string;
  credential_type: string;
  fields: any;
  created_at: string;
  version: number;
  parent_schema_id: string | null;
  is_latest: boolean;
}

interface Credential {
  id: string;
  holder_did: string;
  status: string;
  blockchain_anchor: string | null;
  issued_at: string;
  expires_at: string | null;
  schema_id: string | null;
  credential_schemas: { name: string; credential_type: string } | null;
}

interface SchemaFieldDef {
  name: string;
  type: string;
  required: boolean;
}

const CHART_COLORS = [
  "hsl(175, 60%, 38%)",
  "hsl(220, 70%, 55%)",
  "hsl(262, 60%, 55%)",
  "hsl(45, 80%, 55%)",
];

const FIELD_TYPES = ["string", "number", "boolean", "date", "text"];

const IssuerDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentView = location.pathname === "/issuer/schemas" ? "schemas" : location.pathname === "/issuer/issue" ? "issue" : "dashboard";

  const [isSchemaDialogOpen, setIsSchemaDialogOpen] = useState(false);
  const [isIssueDialogOpen, setIsIssueDialogOpen] = useState(false);
  const [versioningSchema, setVersioningSchema] = useState<Schema | null>(null);
  const [migrationSchema, setMigrationSchema] = useState<Schema | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [schemaName, setSchemaName] = useState("");
  const [schemaType, setSchemaType] = useState("certificate");
  const [schemaFieldDefs, setSchemaFieldDefs] = useState<SchemaFieldDef[]>([{ name: "", type: "string", required: false }]);
  const [holderDid, setHolderDid] = useState("");
  const [selectedSchema, setSelectedSchema] = useState("");
  const [credentialData, setCredentialData] = useState<Record<string, any>>({});
  const [expiresAt, setExpiresAt] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);
  const [signWithWallet, setSignWithWallet] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const { walletAddress, connectWallet, signMessage, isMetaMaskInstalled } = useWeb3Wallet(user?.id);

  const fetchData = async () => {
    if (!user) return;
    setIsLoading(true);
    const [schemasRes, credsRes] = await Promise.all([
      supabase.from("credential_schemas").select("*").eq("issuer_id", user.id).order("created_at", { ascending: false }),
      supabase.from("credentials").select("id, holder_did, status, blockchain_anchor, issued_at, expires_at, schema_id, credential_schemas(name, credential_type)").eq("issuer_id", user.id).order("issued_at", { ascending: false }).limit(100),
    ]);
    if (schemasRes.data) setSchemas(schemasRes.data);
    if (credsRes.data) setCredentials(credsRes.data as any);
    setIsLoading(false);
  };

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    fetchData();
  }, [user]);

  const addField = () => setSchemaFieldDefs([...schemaFieldDefs, { name: "", type: "string", required: false }]);
  const removeField = (index: number) => setSchemaFieldDefs(schemaFieldDefs.filter((_, i) => i !== index));
  const updateField = (index: number, key: keyof SchemaFieldDef, value: any) => {
    const updated = [...schemaFieldDefs];
    updated[index] = { ...updated[index], [key]: value };
    setSchemaFieldDefs(updated);
  };

  const createSchema = async () => {
    if (!user || !schemaName) return;
    const fields = schemaFieldDefs.filter(f => f.name.trim() !== "");
    if (fields.length === 0) {
      toast({ title: "Add at least one field", variant: "destructive" });
      return;
    }
    const { data: newSchema, error } = await supabase.from("credential_schemas").insert({ issuer_id: user.id, name: schemaName, credential_type: schemaType, fields } as any).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await supabase.from("audit_logs").insert({
      user_id: user.id, action: "schema_created", entity_type: "schema",
      entity_id: newSchema?.id, metadata: { name: schemaName, type: schemaType, version: 1 },
    } as any);
    toast({ title: "Schema created (v1)" });
    setIsSchemaDialogOpen(false);
    setSchemaName(""); setSchemaType("certificate"); setSchemaFieldDefs([{ name: "", type: "string", required: false }]);
    fetchData();
  };

  const openVersionDialog = (schema: Schema) => {
    setVersioningSchema(schema);
    setSchemaName(schema.name);
    setSchemaType(schema.credential_type);
    setSchemaFieldDefs(Array.isArray(schema.fields) ? (schema.fields as SchemaFieldDef[]).map(f => ({ ...f })) : [{ name: "", type: "string", required: false }]);
  };

  const createNewVersion = async () => {
    if (!user || !versioningSchema || !schemaName) return;
    const fields = schemaFieldDefs.filter(f => f.name.trim() !== "");
    if (fields.length === 0) {
      toast({ title: "Add at least one field", variant: "destructive" });
      return;
    }
    const newVersion = versioningSchema.version + 1;
    // Mark old as not latest
    await supabase.from("credential_schemas").update({ is_latest: false } as any).eq("id", versioningSchema.id);
    const { data: newSchema, error } = await supabase.from("credential_schemas").insert({
      issuer_id: user.id, name: schemaName, credential_type: schemaType, fields,
      version: newVersion, parent_schema_id: versioningSchema.parent_schema_id || versioningSchema.id, is_latest: true,
    } as any).select().single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      // Revert
      await supabase.from("credential_schemas").update({ is_latest: true } as any).eq("id", versioningSchema.id);
      return;
    }
    await supabase.from("audit_logs").insert({
      user_id: user.id, action: "schema_versioned", entity_type: "schema",
      entity_id: newSchema?.id, metadata: { name: schemaName, version: newVersion, parent: versioningSchema.id },
    } as any);
    toast({ title: `Schema updated to v${newVersion}` });
    setVersioningSchema(null);
    setSchemaName(""); setSchemaType("certificate"); setSchemaFieldDefs([{ name: "", type: "string", required: false }]);
    fetchData();
  };

  // Schema lineage helpers
  const getSchemaFamily = (schema: Schema) => {
    const rootId = schema.parent_schema_id || schema.id;
    return schemas.filter(s => s.id === rootId || s.parent_schema_id === rootId);
  };

  const getOldVersionIds = (schema: Schema) => {
    const family = getSchemaFamily(schema);
    return family.filter(s => s.id !== schema.id).map(s => s.id);
  };

  const getMigratableCount = (schema: Schema) => {
    const oldIds = getOldVersionIds(schema);
    return credentials.filter(c => c.status === "active" && c.schema_id && oldIds.includes(c.schema_id)).length;
  };

  const migrateCredentials = async () => {
    if (!user || !migrationSchema) return;
    setMigrating(true);
    const oldIds = getOldVersionIds(migrationSchema);
    const toMigrate = credentials.filter(c => c.status === "active" && c.schema_id && oldIds.includes(c.schema_id));

    let migrated = 0;
    let failed = 0;
    for (const cred of toMigrate) {
      const { error } = await supabase.from("credentials").update({ schema_id: migrationSchema.id } as any).eq("id", cred.id).eq("issuer_id", user.id);
      if (error) { failed++; } else { migrated++; }
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id, action: "credentials_migrated", entity_type: "schema",
      entity_id: migrationSchema.id, metadata: { migrated, failed, from_schemas: oldIds, to_version: migrationSchema.version },
    } as any);

    toast({
      title: `Migration complete`,
      description: `${migrated} credential${migrated !== 1 ? "s" : ""} migrated to v${migrationSchema.version}${failed > 0 ? `, ${failed} failed` : ""}`,
      variant: failed > 0 ? "destructive" : undefined,
    });
    setMigrationSchema(null);
    setMigrating(false);
    fetchData();
  };

  const issueCredential = async () => {
    if (!user || !selectedSchema || !holderDid) return;
    setIssuing(true);
    try {
      let issuerSignature: string | null = null;
      let signerAddr: string | null = null;
      if (signWithWallet && walletAddress) {
        const message = `DecentraID Credential Issuance\nSchema: ${selectedSchema}\nHolder: ${holderDid}\nTimestamp: ${new Date().toISOString()}`;
        const sig = await signMessage(message);
        if (!sig) { setIssuing(false); return; }
        issuerSignature = sig;
        signerAddr = walletAddress;
      }
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/issue-credential`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.session?.access_token}` },
        body: JSON.stringify({
          schema_id: selectedSchema, holder_did: holderDid, credential_data: credentialData,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          issuer_signature: issuerSignature, signer_address: signerAddr,
        }),
      });
      const result = await res.json();
      if (result.error) {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      } else {
        const bc = result.credential?.credential_data?.blockchain;
        toast({
          title: issuerSignature ? "Credential issued & wallet-signed" : "Credential issued & anchored on-chain",
          description: bc ? `Tx: ${bc.txHash?.substring(0, 18)}... Block: #${bc.blockNumber}` : `Anchor: ${result.credential?.blockchain_anchor}`,
        });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setIssuing(false);
    setIsIssueDialogOpen(false);
    setHolderDid(""); setCredentialData({}); setSelectedSchema(""); setExpiresAt("");
    fetchData();
  };

  const selectedSchemaObj = useMemo(() => schemas.find(s => s.id === selectedSchema), [schemas, selectedSchema]);

  const revokeCredential = async (credId: string) => {
    setRevoking(credId);
    const { error } = await supabase.from("credentials").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", credId).eq("issuer_id", user!.id);
    if (error) {
      toast({ title: "Revocation failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Credential revoked on-chain" });
      await supabase.from("audit_logs").insert({ user_id: user!.id, action: "credential_revoked", entity_type: "credential", entity_id: credId, metadata: {} } as any);
    }
    setRevoking(null);
    fetchData();
  };

  // Analytics
  const activeCount = credentials.filter(c => c.status === "active").length;
  const revokedCount = credentials.filter(c => c.status === "revoked").length;
  const expiredCount = credentials.filter(c => c.status === "expired").length;
  const anchoredCount = credentials.filter(c => c.blockchain_anchor).length;

  const typeDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    credentials.forEach(c => { const type = c.credential_schemas?.credential_type || "unknown"; map[type] = (map[type] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [credentials]);

  const monthlyIssuance = useMemo(() => {
    const map: Record<string, number> = {};
    credentials.forEach(c => { const month = new Date(c.issued_at).toLocaleDateString("en-US", { month: "short", year: "2-digit" }); map[month] = (map[month] || 0) + 1; });
    return Object.entries(map).map(([month, count]) => ({ month, count })).reverse().slice(-6);
  }, [credentials]);

  const renderDashboard = () => (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-issuer-muted flex items-center justify-center"><FileText className="h-5 w-5" style={{ color: "hsl(var(--issuer))" }} /></div><div><p className="text-2xl font-display font-bold text-foreground">{schemas.length}</p><p className="text-sm text-muted-foreground">Schemas</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-issuer-muted flex items-center justify-center"><Send className="h-5 w-5" style={{ color: "hsl(var(--issuer))" }} /></div><div><p className="text-2xl font-display font-bold text-foreground">{credentials.length}</p><p className="text-sm text-muted-foreground">Issued</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-issuer-muted flex items-center justify-center"><Link2 className="h-5 w-5" style={{ color: "hsl(var(--issuer))" }} /></div><div><p className="text-2xl font-display font-bold text-foreground">{anchoredCount}</p><p className="text-sm text-muted-foreground">On-Chain</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center"><Ban className="h-5 w-5 text-destructive" /></div><div><p className="text-2xl font-display font-bold text-foreground">{revokedCount}</p><p className="text-sm text-muted-foreground">Revoked</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center"><Calendar className="h-5 w-5 text-muted-foreground" /></div><div><p className="text-2xl font-display font-bold text-foreground">{expiredCount}</p><p className="text-sm text-muted-foreground">Expired</p></div></div></CardContent></Card>
      </div>

      {/* Analytics */}
      {credentials.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="font-display text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" style={{ color: "hsl(var(--issuer))" }} /> Issuance Trend</CardTitle></CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyIssuance}>
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" fill="hsl(var(--issuer))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="font-display text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" style={{ color: "hsl(var(--issuer))" }} /> By Type</CardTitle></CardHeader>
            <CardContent>
              <div className="h-48 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={typeDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={11}>
                      {typeDistribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Links */}
      <div className="flex gap-3">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate("/audit")}>
          <ScrollText className="h-4 w-4" /> Audit Trail
        </Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate("/explorer")}>
          <Link2 className="h-4 w-4" /> Blockchain Explorer
        </Button>
      </div>

      <TrustedIssuerRegistry />
    </>
  );

  const renderSchemas = () => (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-semibold text-foreground">Credential Schemas</h2>
        <Dialog open={isSchemaDialogOpen} onOpenChange={setIsSchemaDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="issuer" className="gap-2"><Plus className="h-4 w-4" /> Create Schema</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="font-display">Create Credential Schema</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div><Label htmlFor="schema-name">Schema Name</Label><Input id="schema-name" value={schemaName} onChange={e => setSchemaName(e.target.value)} placeholder="e.g., Bachelor's Degree" /></div>
              <div>
                <Label>Credential Type</Label>
                <Select value={schemaType} onValueChange={setSchemaType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="degree">Degree</SelectItem>
                    <SelectItem value="diploma">Diploma</SelectItem>
                    <SelectItem value="certificate">Certificate</SelectItem>
                    <SelectItem value="transcript">Transcript</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fields</Label>
                <div className="space-y-2 mt-1">
                  {schemaFieldDefs.map((field, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        placeholder="Field name"
                        value={field.name}
                        onChange={e => updateField(i, "name", e.target.value)}
                        className="flex-1"
                      />
                      <Select value={field.type} onValueChange={v => updateField(i, "type", v)}>
                        <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                        <input type="checkbox" checked={field.required} onChange={e => updateField(i, "required", e.target.checked)} className="rounded" />
                        Req
                      </label>
                      {schemaFieldDefs.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeField(i)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addField} className="w-full gap-1">
                    <Plus className="h-3 w-3" /> Add Field
                  </Button>
                </div>
              </div>
              <Button variant="issuer" className="w-full" onClick={createSchema}>Create Schema</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {schemas.length === 0 ? (
        <Card><CardContent className="py-12"><div className="flex items-center justify-center text-muted-foreground text-sm">No schemas yet. Create your first credential schema.</div></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {schemas.map(s => (
            <Card key={s.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-display font-semibold text-foreground">{s.name}</h4>
                    <p className="text-xs text-muted-foreground">{s.credential_type} · v{s.version}</p>
                  </div>
                  {s.is_latest && <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground">Latest</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  <p>{Array.isArray(s.fields) ? `${(s.fields as any[]).length} fields` : "Custom fields"}</p>
                  <p>Created: {new Date(s.created_at).toLocaleDateString()}</p>
                </div>
                {Array.isArray(s.fields) && (s.fields as any[]).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(s.fields as any[]).map((f: any, i: number) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                        {f.name}{f.required ? "*" : ""} ({f.type})
                      </span>
                    ))}
                  </div>
                )}
                {s.is_latest && (
                  <div className="flex gap-2 mt-3">
                    <Button variant="outline" size="sm" className="gap-1 flex-1" onClick={() => openVersionDialog(s)}>
                      <GitBranch className="h-3 w-3" /> New Version
                    </Button>
                    {getMigratableCount(s) > 0 && (
                      <Button variant="outline" size="sm" className="gap-1 flex-1" onClick={() => setMigrationSchema(s)}>
                        <ArrowRightLeft className="h-3 w-3" /> Migrate ({getMigratableCount(s)})
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Version Dialog */}
      <Dialog open={!!versioningSchema} onOpenChange={(o) => { if (!o) { setVersioningSchema(null); setSchemaName(""); setSchemaType("certificate"); setSchemaFieldDefs([{ name: "", type: "string", required: false }]); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <GitBranch className="h-4 w-4" style={{ color: "hsl(var(--issuer))" }} />
              New Version — {versioningSchema?.name} (v{versioningSchema ? versioningSchema.version + 1 : ""})
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Modify the fields below. Existing credentials keep their original schema version.</p>
          <div className="space-y-4 pt-2">
            <div><Label htmlFor="version-schema-name">Schema Name</Label><Input id="version-schema-name" value={schemaName} onChange={e => setSchemaName(e.target.value)} /></div>
            <div>
              <Label>Credential Type</Label>
              <Select value={schemaType} onValueChange={setSchemaType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="degree">Degree</SelectItem>
                  <SelectItem value="diploma">Diploma</SelectItem>
                  <SelectItem value="certificate">Certificate</SelectItem>
                  <SelectItem value="transcript">Transcript</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fields</Label>
              <div className="space-y-2 mt-1">
                {schemaFieldDefs.map((field, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input placeholder="Field name" value={field.name} onChange={e => updateField(i, "name", e.target.value)} className="flex-1" />
                    <Select value={field.type} onValueChange={v => updateField(i, "type", v)}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>{FIELD_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                    <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                      <input type="checkbox" checked={field.required} onChange={e => updateField(i, "required", e.target.checked)} className="rounded" /> Req
                    </label>
                    {schemaFieldDefs.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeField(i)}><Trash2 className="h-3 w-3" /></Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addField} className="w-full gap-1"><Plus className="h-3 w-3" /> Add Field</Button>
              </div>
            </div>
            <Button variant="issuer" className="w-full" onClick={createNewVersion}>
              Create v{versioningSchema ? versioningSchema.version + 1 : ""}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Migration Dialog */}
      <Dialog open={!!migrationSchema} onOpenChange={(o) => { if (!o && !migrating) setMigrationSchema(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" style={{ color: "hsl(var(--issuer))" }} />
              Migrate Credentials
            </DialogTitle>
          </DialogHeader>
          {migrationSchema && (() => {
            const oldVersions = getSchemaFamily(migrationSchema).filter(s => s.id !== migrationSchema.id).sort((a, b) => a.version - b.version);
            const migratableCount = getMigratableCount(migrationSchema);
            return (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Move active credentials from older schema versions to <strong className="text-foreground">{migrationSchema.name} v{migrationSchema.version}</strong>.
                </p>

                <div className="bg-muted rounded-lg p-3 space-y-2">
                  {oldVersions.map(old => {
                    const count = credentials.filter(c => c.status === "active" && c.schema_id === old.id).length;
                    return (
                      <div key={old.id} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">v{old.version}</span>
                        <span className="font-medium text-foreground">{count} active credential{count !== 1 ? "s" : ""}</span>
                      </div>
                    );
                  })}
                  <div className="border-t border-border pt-2 flex items-center justify-between text-sm font-medium">
                    <span className="text-foreground">Total to migrate</span>
                    <span className="text-foreground">{migratableCount}</span>
                  </div>
                </div>

                <div className="flex items-start gap-2 bg-muted/50 rounded-lg p-3">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    This updates the schema reference on each credential. Credential data is preserved. If new fields were added in v{migrationSchema.version}, they won't be populated on existing credentials.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setMigrationSchema(null)} disabled={migrating}>
                    Cancel
                  </Button>
                  <Button variant="issuer" className="flex-1 gap-2" onClick={migrateCredentials} disabled={migrating || migratableCount === 0}>
                    {migrating ? <><Loader2 className="h-4 w-4 animate-spin" /> Migrating...</> : `Migrate ${migratableCount} credential${migratableCount !== 1 ? "s" : ""}`}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );

  const renderIssue = () => (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-semibold text-foreground">Issue Credentials</h2>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-dashed"><CardContent className="pt-6">
          <Dialog open={isIssueDialogOpen} onOpenChange={setIsIssueDialogOpen}>
            <DialogTrigger asChild>
              <button className="w-full text-left group">
                <div className="flex items-center gap-3 mb-2"><Send className="h-5 w-5 text-muted-foreground group-hover:text-issuer transition-colors" /><h3 className="font-display font-semibold text-foreground">Issue Credential</h3></div>
                <p className="text-sm text-muted-foreground">Issue with blockchain anchoring</p>
              </button>
            </DialogTrigger>
            <DialogContent><DialogHeader><DialogTitle className="font-display">Issue Verifiable Credential</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div><Label>Holder DID</Label><Input value={holderDid} onChange={e => setHolderDid(e.target.value)} placeholder="did:decentraid:..." /></div>
                <div><Label>Schema</Label><Select value={selectedSchema} onValueChange={(v) => { setSelectedSchema(v); setCredentialData({}); }}><SelectTrigger><SelectValue placeholder="Select schema" /></SelectTrigger><SelectContent>{schemas.filter(s => s.is_latest).map(s => <SelectItem key={s.id} value={s.id}>{s.name} <span className="text-muted-foreground ml-1">v{s.version}</span></SelectItem>)}</SelectContent></Select></div>
                {selectedSchemaObj ? (
                  <SchemaForm fields={selectedSchemaObj.fields as any[]} value={credentialData} onChange={setCredentialData} />
                ) : (
                  <div className="text-xs text-muted-foreground text-center py-2">Select a schema to see form fields</div>
                )}
                <div>
                  <Label>Expiration Date (optional)</Label>
                  <Input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
                </div>
                <div className="flex items-center justify-between bg-muted rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Sign with Wallet</p>
                      <p className="text-xs text-muted-foreground">
                        {walletAddress ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}` : "Connect wallet first"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={signWithWallet}
                    onCheckedChange={(checked) => {
                      if (checked && !walletAddress) { connectWallet(); } else { setSignWithWallet(checked); }
                    }}
                    disabled={!isMetaMaskInstalled}
                  />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
                  <Link2 className="h-3 w-3 shrink-0" />
                  <span>{signWithWallet ? "Credential will be wallet-signed & anchored on Polygon" : "Credential will be anchored on-chain with SHA-256 hash proof"}</span>
                </div>
                <Button variant="issuer" className="w-full" onClick={issueCredential} disabled={issuing}>
                  {issuing ? "Signing & anchoring..." : signWithWallet ? "Sign & Issue Credential" : "Issue & Anchor Credential"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent></Card>

        <Card className="border-dashed"><CardContent className="pt-6">
          <BatchIssuanceDialog schemas={schemas} onComplete={fetchData} />
        </CardContent></Card>

        <Card className="border-dashed"><CardContent className="pt-6">
          <OID4VCIOfferDialog schemas={schemas} />
        </CardContent></Card>
      </div>

      {/* Credentials List */}
      <Card>
        <CardHeader><CardTitle className="font-display text-lg">Issued Credentials</CardTitle></CardHeader>
        <CardContent>
          {credentials.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No credentials issued yet.</div>
          ) : (
            <div className="space-y-3">
              {credentials.map(c => (
                <div key={c.id} className="flex items-center justify-between py-3 px-3 border border-border/50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{c.credential_schemas?.name || "Unknown"}</p>
                      <span className="text-xs text-muted-foreground">({c.credential_schemas?.credential_type})</span>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate">{c.holder_did}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{new Date(c.issued_at).toLocaleDateString()}</span>
                      {c.expires_at && (
                        <span className={new Date(c.expires_at) < new Date() ? "text-destructive" : ""}>
                          Exp: {new Date(c.expires_at).toLocaleDateString()}
                        </span>
                      )}
                      {c.blockchain_anchor && (
                        <span className="font-mono text-primary">⛓ {c.blockchain_anchor.substring(0, 20)}...</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      c.status === "active" ? "bg-accent text-accent-foreground" :
                      c.status === "expired" ? "bg-muted text-muted-foreground" :
                      "bg-destructive/10 text-destructive"
                    }`}>{c.status}</span>
                    {c.status === "active" && (
                      <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => setRevokeConfirmId(c.id)} disabled={revoking === c.id}>
                        {revoking === c.id ? "..." : <><Ban className="h-3 w-3 mr-1" /> Revoke</>}
                      </Button>
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

  return (
    <PortalLayout title="Issuer Portal" portalType="issuer" icon={<Shield className="h-5 w-5" style={{ color: "hsl(var(--issuer))" }} />} navItems={navItems}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] }}
        className="space-y-8"
      >
        {isLoading ? <DashboardSkeleton stats={5} showCharts={currentView === "dashboard"} listItems={currentView === "schemas" ? 4 : 5} /> : (
          <>
            {currentView === "dashboard" && renderDashboard()}
            {currentView === "schemas" && renderSchemas()}
            {currentView === "issue" && renderIssue()}
          </>
        )}
      </motion.div>
      <AlertDialog open={!!revokeConfirmId} onOpenChange={(open) => !open && setRevokeConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this credential?</AlertDialogTitle>
            <AlertDialogDescription>This action is permanent and cannot be undone. The credential will be marked as revoked on-chain.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (revokeConfirmId) { revokeCredential(revokeConfirmId); setRevokeConfirmId(null); } }}>
              Revoke Credential
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PortalLayout>
  );
};

export default IssuerDashboard;
