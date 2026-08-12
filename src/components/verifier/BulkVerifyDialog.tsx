import { useState, useRef } from "react";
import {
  Layers, Loader2, CheckCircle2, XCircle, FileUp, ClipboardList, Download, RefreshCw,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { bulkVerify, downloadTextFile, type BulkVerifyResult } from "@/services/api/verifier.service";
import VerificationResultView from "./VerificationResultView";
import { motion, AnimatePresence } from "framer-motion";

interface BulkVerifyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecordsRefresh: () => void;
}

const parseInput = (input: string): string[] => {
  const trimmed = input.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
    }
  } catch {
    /* not a JSON array — fall through to line splitting */
  }
  return trimmed
    .split(/\n|,|;/)
    .map((s) => s.trim())
    .filter(Boolean);
};

const BulkVerifyDialog = ({ open, onOpenChange, onRecordsRefresh }: BulkVerifyDialogProps) => {
  const { toast } = useToast();
  const [mode, setMode] = useState<"vps" | "csv">("vps");
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<BulkVerifyResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setInput("");
    setResults([]);
    setSelectedIndex(null);
    setProgress({ done: 0, total: 0 });
  };

  const runVerification = async () => {
    const lines = parseInput(input);
    if (lines.length === 0) {
      toast({ title: "Nothing to verify", description: "Add at least one VP JSON or credential ID.", variant: "destructive" });
      return;
    }
    if (lines.length > 50) {
      toast({ title: "Too many items", description: "Maximum 50 per batch.", variant: "destructive" });
      return;
    }

    setRunning(true);
    setResults([]);
    setSelectedIndex(null);

    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token ?? "";

    const items = lines.map((line, i) => {
      const label = `Item ${i + 1}`;
      if (mode === "csv" || /^[0-9a-fA-F-]{20,}$/.test(line.trim()) || line.trim().startsWith("REPLACE")) {
        return { label, body: { credential_id: line.trim() } as const };
      }
      try {
        const parsed = JSON.parse(line);
        const hasId = parsed?.credential_id || parsed?.verifiableCredential?.id;
        return hasId
          ? { label, body: { credential_id: hasId } as const }
          : { label, body: { vp_json: parsed } as const };
      } catch {
        return { label, body: { vp_json: line } as const };
      }
    });

    try {
      const out = await bulkVerify(items, token, (done, total) => setProgress({ done, total }));
      setResults(out);
      const ok = out.filter((r) => r.status === "success" && r.data?.valid).length;
      const fail = out.filter((r) => r.status === "success" && !r.data?.valid).length;
      const err = out.filter((r) => r.status === "error").length;
      toast({
        title: "Batch complete",
        description: `${ok} valid · ${fail} invalid · ${err} failed`,
      });
      onRecordsRefresh();
    } catch {
      toast({ title: "Batch failed", description: "Unexpected error while running the batch.", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const exportResults = () => {
    const rows = results.map((r) => {
      if (r.status === "error") return { item: r.label, status: "error", valid: "", error: r.error ?? "" };
      return {
        item: r.label,
        status: r.status,
        valid: r.data?.valid ? "true" : "false",
        hash_integrity: r.data?.hash_integrity ? "true" : "false",
        not_revoked: r.data?.not_revoked ? "true" : "false",
        not_expired: r.data?.not_expired === false ? "false" : "true",
        ai_score: (r.data?.ai_analysis as any)?.score ?? "",
        error: "",
      };
    });
    const headers = ["item", "status", "valid", "hash_integrity", "not_revoked", "not_expired", "ai_score", "error"];
    const csv = [headers.join(","), ...rows.map((row) => headers.map((h) => {
      const v = String((row as any)[h] ?? "");
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(","))].join("\n");
    downloadTextFile(`blockid-batch-verify-${Date.now()}.csv`, csv, "text/csv");
    toast({ title: "Results exported" });
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setMode("csv");
      setInput(text);
      toast({ title: "File loaded", description: `${file.name} imported — ready to verify.` });
    };
    reader.readAsText(file);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <Layers className="h-5 w-5 text-verifier" />
            Bulk Verify Credentials
          </DialogTitle>
        </DialogHeader>

        {results.length === 0 ? (
          <div className="space-y-5 pt-2">
            <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
              <TabsList className="grid grid-cols-2">
                <TabsTrigger value="vps" className="gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5" /> VP JSONs
                </TabsTrigger>
                <TabsTrigger value="csv" className="gap-1.5">
                  <FileUp className="h-3.5 w-3.5" /> Credential IDs / CSV
                </TabsTrigger>
              </TabsList>

              <TabsContent value="vps" className="space-y-3 mt-3">
                <Label>Verifiable Presentations (JSON)</Label>
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={8}
                  placeholder={'One VP per line, or a JSON array:\n\n{"verifiableCredential":{"id":"cred-uuid"}}\n{"credential_id":"cred-uuid"}\n[{...}, {...}]'}
                  className="font-mono text-xs input-solid"
                />
              </TabsContent>

              <TabsContent value="csv" className="space-y-3 mt-3">
                <Label>Credential IDs</Label>
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={8}
                  placeholder={"One credential ID per line, comma/semicolon separated, or paste a CSV:\n\ncred-uuid-1\ncred-uuid-2, cred-uuid-3"}
                  className="font-mono text-xs input-solid"
                />
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
                  <FileUp className="h-3.5 w-3.5" /> Upload CSV file
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = "";
                  }}
                />
              </TabsContent>
            </Tabs>

            <Button className="w-full btn-primary" onClick={runVerification} disabled={running || !input.trim()}>
              {running ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying {progress.done}/{progress.total}...
                </span>
              ) : "Verify All"}
            </Button>
          </div>
        ) : (
          <div className="space-y-5 pt-2">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Valid", value: results.filter((r) => r.status === "success" && r.data?.valid).length, color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" },
                { label: "Invalid", value: results.filter((r) => r.status === "success" && !r.data?.valid).length, color: "text-destructive bg-destructive/10 border-destructive/20" },
                { label: "Errors", value: results.filter((r) => r.status === "error").length, color: "text-amber-600 bg-amber-500/10 border-amber-500/20" },
              ].map((s) => (
                <div key={s.label} className={`p-3 rounded-lg text-center border ${s.color}`}>
                  <p className="text-2xl font-display font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={exportResults}>
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { reset(); }}>
                <RefreshCw className="h-3.5 w-3.5" /> New Batch
              </Button>
            </div>

            {/* Results list */}
            <div className="space-y-2">
              {results.map((r, i) => (
                <div key={i} className="rounded-lg border border-border/50 overflow-hidden">
                  <button
                    className="w-full text-left p-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
                    onClick={() => setSelectedIndex(selectedIndex === i ? null : i)}
                  >
                    {r.status === "error" ? (
                      <XCircle className="h-5 w-5 text-amber-500 shrink-0" />
                    ) : r.data?.valid ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive shrink-0" />
                    )}
                    <span className="text-sm font-medium text-foreground flex-1 min-w-0 truncate">{r.label}</span>
                    {r.status === "error" ? (
                      <span className="text-xs text-amber-600 font-medium shrink-0">Failed</span>
                    ) : (
                      <span className="text-xs shrink-0">
                        <span className="font-mono text-muted-foreground">
                          {(r.data?.ai_analysis as any)?.score != null ? `Score ${(r.data.ai_analysis as any).score}% · ` : ""}
                        </span>
                        <span className={r.data?.valid ? "text-emerald-600" : "text-destructive"}>
                          {r.data?.valid ? "Valid" : "Invalid"}
                        </span>
                      </span>
                    )}
                  </button>
                  <AnimatePresence>
                    {selectedIndex === i && r.status === "success" && (
                      <div className="px-3 pb-3 border-t border-border/40">
                        <div className="pt-3">
                          <VerificationResultView result={r.data!} compact />
                        </div>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BulkVerifyDialog;
