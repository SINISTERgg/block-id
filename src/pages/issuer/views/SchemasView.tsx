import { useState } from "react";
import { Plus, GitBranch, ArrowRightLeft, AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import SchemaFieldEditor from "@/components/issuer/SchemaFieldEditor";
import CredentialTypeSelect from "@/components/issuer/CredentialTypeSelect";
import type { IssuerCredential, IssuerSchema, SchemaFieldDef } from "@/services/api/issuer.service";

interface SchemasViewProps {
  schemas: IssuerSchema[];
  credentials: IssuerCredential[];
  onCreate: (name: string, type: string, fields: SchemaFieldDef[]) => Promise<void>;
  onNewVersion: (base: IssuerSchema, name: string, type: string, fields: SchemaFieldDef[]) => Promise<void>;
  onMigrate: (target: IssuerSchema) => Promise<void>;
}

const SchemasView = ({ schemas, credentials, onCreate, onNewVersion, onMigrate }: SchemasViewProps) => {
  const [isSchemaDialogOpen, setIsSchemaDialogOpen] = useState(false);
  const [versioningSchema, setVersioningSchema] = useState<IssuerSchema | null>(null);
  const [migrationSchema, setMigrationSchema] = useState<IssuerSchema | null>(null);
  const [migrating, setMigrating] = useState(false);

  // New schema form state
  const [schemaName, setSchemaName] = useState("");
  const [schemaType, setSchemaType] = useState("certificate");
  const [schemaFields, setSchemaFields] = useState<SchemaFieldDef[]>([{ name: "", type: "string", required: false }]);

  const handleCreate = async () => {
    await onCreate(schemaName, schemaType, schemaFields);
    setIsSchemaDialogOpen(false);
    setSchemaName(""); setSchemaType("certificate");
    setSchemaFields([{ name: "", type: "string", required: false }]);
  };

  const openVersionDialog = (schema: IssuerSchema) => {
    setVersioningSchema(schema);
    setSchemaName(schema.name);
    setSchemaType(schema.credential_type);
    setSchemaFields(Array.isArray(schema.fields) ? (schema.fields as SchemaFieldDef[]).map((f) => ({ ...f })) : [{ name: "", type: "string", required: false }]);
  };

  const handleNewVersion = async () => {
    if (!versioningSchema) return;
    await onNewVersion(versioningSchema, schemaName, schemaType, schemaFields);
    setVersioningSchema(null);
    setSchemaName(""); setSchemaType("certificate");
    setSchemaFields([{ name: "", type: "string", required: false }]);
  };

  const handleMigrate = async () => {
    if (!migrationSchema) return;
    setMigrating(true);
    await onMigrate(migrationSchema);
    setMigrating(false);
    setMigrationSchema(null);
  };

  // Schema lineage helpers
  const getSchemaFamily = (schema: IssuerSchema) => {
    const rootId = schema.parent_schema_id || schema.id;
    return schemas.filter((s) => s.id === rootId || s.parent_schema_id === rootId);
  };

  const getMigratableCount = (schema: IssuerSchema) => {
    const family = getSchemaFamily(schema);
    const oldIds = family.filter((s) => s.id !== schema.id).map((s) => s.id);
    return credentials.filter((c) => c.status === "active" && c.schema_id && oldIds.includes(c.schema_id)).length;
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-semibold text-foreground">Credential Schemas</h2>
        <Dialog open={isSchemaDialogOpen} onOpenChange={setIsSchemaDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="issuer" className="gap-2">
              <Plus className="h-4 w-4" /> Create Schema
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="font-display">Create Credential Schema</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div><Label htmlFor="schema-name">Schema Name</Label><Input id="schema-name" value={schemaName} onChange={(e) => setSchemaName(e.target.value)} placeholder="e.g., Bachelor's Degree" /></div>
              <div><Label>Credential Type</Label><CredentialTypeSelect value={schemaType} onValueChange={setSchemaType} /></div>
              <div><Label>Fields</Label><div className="mt-1"><SchemaFieldEditor fields={schemaFields} onChange={setSchemaFields} /></div></div>
              <Button variant="issuer" className="w-full" onClick={handleCreate}>Create Schema</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {schemas.length === 0 ? (
        <Card><CardContent className="py-12"><div className="flex items-center justify-center text-muted-foreground text-sm">No schemas yet. Create your first credential schema.</div></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {schemas.map((s) => (
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

      {/* New Version Dialog */}
      <Dialog open={!!versioningSchema} onOpenChange={(o) => { if (!o) { setVersioningSchema(null); setSchemaName(""); setSchemaType("certificate"); setSchemaFields([{ name: "", type: "string", required: false }]); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <GitBranch className="h-4 w-4" style={{ color: "hsl(var(--issuer))" }} />
              New Version — {versioningSchema?.name} (v{versioningSchema ? versioningSchema.version + 1 : ""})
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Modify the fields below. Existing credentials keep their original schema version.</p>
          <div className="space-y-4 pt-2">
            <div><Label>Schema Name</Label><Input value={schemaName} onChange={(e) => setSchemaName(e.target.value)} /></div>
            <div><Label>Credential Type</Label><CredentialTypeSelect value={schemaType} onValueChange={setSchemaType} /></div>
            <div><Label>Fields</Label><div className="mt-1"><SchemaFieldEditor fields={schemaFields} onChange={setSchemaFields} /></div></div>
            <Button variant="issuer" className="w-full" onClick={handleNewVersion}>
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
            const family = getSchemaFamily(migrationSchema);
            const oldVersions = family.filter((s) => s.id !== migrationSchema.id).sort((a, b) => a.version - b.version);
            const migratableCount = getMigratableCount(migrationSchema);
            return (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Move active credentials from older schema versions to <strong className="text-foreground">{migrationSchema.name} v{migrationSchema.version}</strong>.
                </p>
                <div className="bg-muted rounded-lg p-3 space-y-2">
                  {oldVersions.map((old) => {
                    const count = credentials.filter((c) => c.status === "active" && c.schema_id === old.id).length;
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
                  <Button variant="outline" className="flex-1" onClick={() => setMigrationSchema(null)} disabled={migrating}>Cancel</Button>
                  <Button variant="issuer" className="flex-1 gap-2" onClick={handleMigrate} disabled={migrating || migratableCount === 0}>
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
};

export default SchemasView;
