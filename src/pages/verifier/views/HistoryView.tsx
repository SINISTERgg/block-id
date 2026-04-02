import { useMemo } from "react";
import { Brain } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { VerificationRecord } from "@/services/api/verifier.service";

interface HistoryViewProps {
  records: VerificationRecord[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

const HistoryView = ({ records, searchQuery, onSearchChange }: HistoryViewProps) => {
  const filteredRecords = useMemo(() => {
    if (!searchQuery) return records;
    const q = searchQuery.toLowerCase();
    return records.filter((r) =>
      r.holder_did?.toLowerCase().includes(q) ||
      r.credential_type?.toLowerCase().includes(q) ||
      r.purpose?.toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q)
    );
  }, [records, searchQuery]);

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-display font-semibold text-foreground">Verification History</h2>
        <Input
          placeholder="Search history…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="max-w-xs h-8 text-xs"
        />
      </div>
      <Card>
        <CardContent className="pt-6">
          {filteredRecords.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              {records.length === 0 ? "No verifications yet." : "No results match your search."}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRecords.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{r.credential_type || "Credential"} {r.purpose && `— ${r.purpose}`}</p>
                    {r.holder_did && <p className="text-xs text-muted-foreground font-mono">{r.holder_did.substring(0, 30)}...</p>}
                    <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()} {new Date(r.created_at).toLocaleTimeString()}</p>
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
};

export default HistoryView;
