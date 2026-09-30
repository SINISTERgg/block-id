import { useState, useRef, useMemo } from "react";
import { Upload, FileText, AlertCircle, CheckCircle2, Download, Table2, XCircle, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { validateFile, validateLineCount } from "@/lib/fileValidation";
import { validateCredentialData, isValidHolderDid, type ConstrainedField } from "@/lib/schemaValidation";

interface Schema {
  id: string;
  name: string;
  credential_type: string;
  fields: any;
  version?: number;
}

interface BatchIssuanceDialogProps {
  schemas: Schema[];
  onComplete: () => void;
}

interface ParsedRow {
  holder_did: string;
  credential_data: Record<string, any>;
  expires_at?: string;
  /** Field name → error message; empty means the row passed pre-flight. */
  errors: Record<string, string>;
  rowNumber: number;
}

const RESERVED_COLUMNS = new Set(["holder_did", "did", "expires_at"]);

/** Normalize a schema's `fields` blob into a list we can validate against. */
function toFields(schema: Schema | undefined): ConstrainedField[] {
  if (!schema?.fields) return [];
  return (Array.isArray(schema.fields) ? schema.fields : []) as ConstrainedField[];
}

/** RFC 4180 quoting — a comma inside a value must not shift every later column. */
function escapeCsvValue(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Parse CSV text into header/value rows, honouring quoted fields. */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(current); current = ""; continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += ch;
  }
  if (current !== "" || row.length > 0) { row.push(current); rows.push(row); }
  return rows;
}

const BatchIssuanceDialog = ({ schemas, onComplete }: BatchIssuanceDialogProps) => {
  const [open, setOpen] = useState(false);
  const [selectedSchema, setSelectedSchema] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [issuing, setIssuing] = useState(false);
  const [result, setResult] = useState<{ issued: number; errors: any[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const activeSchema = useMemo(() => schemas.find((s) => s.id === selectedSchema), [schemas, selectedSchema]);
  const activeFields = useMemo(() => toFields(activeSchema), [activeSchema]);

  const validRows = useMemo(() => parsedRows.filter((r) => Object.keys(r.errors).length === 0), [parsedRows]);
  const invalidRows = useMemo(() => parsedRows.filter((r) => Object.keys(r.errors).length > 0), [parsedRows]);

  const downloadTemplate = () => {
    if (!activeSchema) return;
    const headers = ["holder_did", "expires_at", ...activeFields.map((f) => f.name)];
    const sample = [ "did:ethr:sepolia:0x0000000000000000000000000000000000000000", "" ];
    // A one-value-per-option hint row makes constrained fields self-documenting.
    activeFields.forEach((f) => {
      if (f.options?.length) sample.push(f.options[0]);
      else if (f.type === "number") sample.push("0");
      else if (f.type === "boolean") sample.push("true");
      else if (f.type === "date") sample.push("2026-01-01");
      else sample.push("");
    });

    const csv = [
      headers.map(escapeCsvValue).join(","),
      sample.map(escapeCsvValue).join(","),
    ].join("\r\n");

    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeSchema.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "schema"}-batch-template.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Template downloaded", description: `${headers.length} columns generated from "${activeSchema.name}".` });
  };

  const parseCSV = (text: string): ParsedRow[] => {
    const rows = parseCsvRows(text.trim());
    if (rows.length < 2) return [];
    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const didIndex = headers.findIndex((h) => h === "holder_did" || h === "did");
    if (didIndex === -1) return [];

    return rows
      .slice(1)
      .map((values, idx) => ({ values, idx }))
      .filter(({ values }) => values.some((v) => v.trim()))
      .map(({ values, idx }) => {
        const holder_did = (values[didIndex] ?? "").trim();
        const credential_data: Record<string, any> = {};
        headers.forEach((h, i) => {
          if (!RESERVED_COLUMNS.has(h) && values[i]) {
            credential_data[h] = values[i].trim();
          }
        });
        const expiresIdx = headers.indexOf("expires_at");

        const errors: Record<string, string> = {};
        if (!isValidHolderDid(holder_did)) {
          errors.holder_did = holder_did
            ? "Not a valid DID or 0x address"
            : "holder_did is required";
        }
        for (const [field, message] of Object.entries(validateCredentialData(activeFields, credential_data))) {
          errors[field] = message;
        }

        return {
          holder_did,
          credential_data,
          expires_at: expiresIdx !== -1 ? values[expiresIdx]?.trim() || undefined : undefined,
          errors,
          rowNumber: idx + 2,
        };
      });
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const check = validateFile(file, { allowedExtensions: ["csv"] });
    if (!check.ok) {
      toast({ title: "Invalid file", description: check.error, variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").filter((l) => l.trim());
      const countCheck = validateLineCount(lines);
      if (!countCheck.ok) {
        toast({ title: "Invalid file", description: countCheck.error, variant: "destructive" });
        return;
      }
      const rows = parseCSV(text);
      setParsedRows(rows);
      if (rows.length === 0) {
        toast({ title: "Invalid CSV", description: "Ensure the CSV has a 'holder_did' column", variant: "destructive" });
      }
    };
    reader.readAsText(file);
  };

  const issueBatch = async () => {
    if (!selectedSchema || validRows.length === 0) return;
    setIssuing(true);
    setResult(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/issue-credential`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.session?.access_token}` },
        body: JSON.stringify({
          schema_id: selectedSchema,
          expires_at: expiresAt || null,
          batch: validRows.map(r => ({
            holder_did: r.holder_did,
            credential_data: r.credential_data,
            expires_at: r.expires_at || expiresAt || null,
          })),
        }),
      });
      const data = await res.json();
      if (data.error) {
        toast({ title: "Batch failed", description: data.error, variant: "destructive" });
      } else {
        setResult({ issued: data.issued, errors: data.errors || [] });
        toast({ title: `Batch complete: ${data.issued} issued` });
        onComplete();
      }
    } catch {
      toast({ title: "Error", description: "Batch issuance failed", variant: "destructive" });
    }
    setIssuing(false);
  };

  const reset = () => {
    setParsedRows([]);
    setResult(null);
    setSelectedSchema("");
    setExpiresAt("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <button className="w-full text-left group">
          <div className="flex items-center gap-3 mb-2">
            <Upload className="h-5 w-5 text-muted-foreground group-hover:text-issuer transition-colors" />
            <h3 className="font-display font-semibold text-foreground">Batch Issue (CSV)</h3>
          </div>
          <p className="text-sm text-muted-foreground">Upload a CSV to issue credentials to multiple holders at once</p>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">Batch Credential Issuance</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Schema</Label>
            <div className="flex gap-2">
              <Select
                value={selectedSchema}
                onValueChange={(v) => { setSelectedSchema(v); setParsedRows([]); if (fileRef.current) fileRef.current.value = ""; }}
              >
                <SelectTrigger><SelectValue placeholder="Select schema" /></SelectTrigger>
                <SelectContent>{schemas.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button
                variant="outline"
                className="shrink-0 gap-2"
                onClick={downloadTemplate}
                disabled={!activeSchema}
                title={activeSchema ? "Generate a CSV with this schema's columns" : "Select a schema first"}
              >
                <Download className="h-4 w-4" /> Template
              </Button>
            </div>
            {activeSchema && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Template columns:{" "}
                <code className="font-mono text-[10px] bg-muted px-1 rounded">holder_did</code>,{" "}
                <code className="font-mono text-[10px] bg-muted px-1 rounded">expires_at</code>
                {activeFields.length > 0 && ", then "}
                {activeFields.length > 0 && activeFields.map((f) => f.name).join(", ")}
              </p>
            )}
          </div>

          <div>
            <Label>Default Expiration Date (optional)</Label>
            <Input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
          </div>

          <div>
            <Label>CSV File</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Columns: <code className="bg-muted px-1 rounded">holder_did</code> (required), plus any schema fields. Optional: <code className="bg-muted px-1 rounded">expires_at</code>
            </p>
            <Input ref={fileRef} type="file" accept=".csv" onChange={handleFile} />
          </div>

          {/* ── Pre-flight data grid ───────────────────────────────── */}
          {parsedRows.length > 0 && (
            <div className="border border-border">
              <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-issuer" />
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground">
                    Pre-flight check
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.12em]">
                  <span className="flex items-center gap-1 text-success">
                    <CircleCheck className="h-3.5 w-3.5" /> {validRows.length} valid
                  </span>
                  <span className="flex items-center gap-1 text-destructive">
                    <XCircle className="h-3.5 w-3.5" /> {invalidRows.length} invalid
                  </span>
                </div>
              </div>

              <div className="max-h-72 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground w-10">Row</th>
                      <th className="px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Holder DID</th>
                      {activeFields.map((f) => (
                        <th key={f.name} className="px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                          {f.name}
                          {f.required && <span className="text-destructive ml-0.5">*</span>}
                        </th>
                      ))}
                      <th className="px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Issues</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parsedRows.map((r) => {
                      const hasErrors = Object.keys(r.errors).length > 0;
                      return (
                        <tr key={r.rowNumber} className={hasErrors ? "bg-destructive/10" : "hover:bg-muted/30"}>
                          <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground tabular-nums">{r.rowNumber}</td>
                          <td className="px-3 py-2 font-mono text-[10px] break-all">
                            {r.holder_did || <span className="text-destructive">—</span>}
                          </td>
                          {activeFields.map((f) => {
                            const invalid = !!r.errors[f.name];
                            const raw = r.credential_data[f.name];
                            return (
                              <td key={f.name} className={`px-3 py-2 break-all ${invalid ? "text-destructive font-medium" : "text-foreground"}`}>
                                {raw ? String(raw) : <span className="text-muted-foreground">—</span>}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2">
                            {hasErrors ? (
                              <ul className="space-y-0.5">
                                {Object.entries(r.errors).map(([field, message]) => (
                                  <li key={field} className="text-destructive text-[10px]">{message}</li>
                                ))}
                              </ul>
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {invalidRows.length > 0 && (
                <p className="border-t border-border bg-destructive/10 px-4 py-2 text-[11px] text-destructive">
                  {invalidRows.length} row{invalidRows.length !== 1 ? "s" : ""} will be skipped. Fix the source CSV and
                  re-upload to include {invalidRows.length !== 1 ? "them" : "it"}.
                </p>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-accent-foreground" />
                <span className="text-foreground font-medium">{result.issued} credentials issued successfully</span>
              </div>
              {result.errors.length > 0 && (
                <div className="bg-destructive/10 rounded-lg p-2">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span className="text-xs text-destructive font-medium">{result.errors.length} failed</span>
                  </div>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-destructive font-mono">{e.holder_did}: {e.error}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <Button
            variant="issuer"
            className="w-full"
            onClick={issueBatch}
            disabled={issuing || !selectedSchema || validRows.length === 0}
          >
            {issuing
              ? "Issuing..."
              : validRows.length > 0
                ? `Issue to ${validRows.length} holder${validRows.length !== 1 ? "s" : ""}`
                : "Issue batch"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BatchIssuanceDialog;
