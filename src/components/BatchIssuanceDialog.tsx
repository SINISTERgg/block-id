import { useState, useRef } from "react";
import { Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Schema {
  id: string;
  name: string;
  credential_type: string;
  fields: any;
}

interface BatchIssuanceDialogProps {
  schemas: Schema[];
  onComplete: () => void;
}

interface ParsedRow {
  holder_did: string;
  credential_data: Record<string, any>;
  expires_at?: string;
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

  const parseCSV = (text: string): ParsedRow[] => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const didIndex = headers.findIndex(h => h === "holder_did" || h === "did");
    if (didIndex === -1) return [];

    return lines.slice(1).filter(l => l.trim()).map(line => {
      const values = line.split(",").map(v => v.trim());
      const holder_did = values[didIndex];
      const credential_data: Record<string, any> = {};
      headers.forEach((h, i) => {
        if (h !== "holder_did" && h !== "did" && h !== "expires_at" && values[i]) {
          credential_data[h] = values[i];
        }
      });
      const expiresIdx = headers.indexOf("expires_at");
      return {
        holder_did,
        credential_data,
        expires_at: expiresIdx !== -1 ? values[expiresIdx] : undefined,
      };
    });
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      setParsedRows(rows);
      if (rows.length === 0) {
        toast({ title: "Invalid CSV", description: "Ensure the CSV has a 'holder_did' column", variant: "destructive" });
      }
    };
    reader.readAsText(file);
  };

  const issueBatch = async () => {
    if (!selectedSchema || parsedRows.length === 0) return;
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
          batch: parsedRows.map(r => ({
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
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-display">Batch Credential Issuance</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Schema</Label>
            <Select value={selectedSchema} onValueChange={setSelectedSchema}>
              <SelectTrigger><SelectValue placeholder="Select schema" /></SelectTrigger>
              <SelectContent>{schemas.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
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

          {parsedRows.length > 0 && (
            <div className="bg-muted rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">{parsedRows.length} recipients parsed</span>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {parsedRows.slice(0, 5).map((r, i) => (
                  <p key={i} className="text-xs font-mono text-muted-foreground truncate">{r.holder_did}</p>
                ))}
                {parsedRows.length > 5 && <p className="text-xs text-muted-foreground">...and {parsedRows.length - 5} more</p>}
              </div>
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

          <Button variant="issuer" className="w-full" onClick={issueBatch} disabled={issuing || !selectedSchema || parsedRows.length === 0}>
            {issuing ? "Issuing..." : `Issue to ${parsedRows.length} holders`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BatchIssuanceDialog;
