import { useState } from "react";
import { Ban, Loader2, Link2 } from "lucide-react";
import { AMOY_EXPLORER } from "@/services/blockchain/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import type { IssuerCredential } from "@/services/api/issuer.service";

// Re-exported for backward compat with other consumers
export type CredentialRow = IssuerCredential;

interface CredentialDataGridProps {
  credentials: IssuerCredential[];
  onRevoke: (credId: string) => Promise<void>;
  revokingId: string | null;
}

const PAGE_SIZE = 25;

const CredentialDataGrid = ({ credentials, onRevoke, revokingId }: CredentialDataGridProps) => {
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);

  // Filter
  const filtered = credentials.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.holder_did.toLowerCase().includes(q) ||
      c.credential_schemas?.name?.toLowerCase().includes(q) ||
      c.credential_schemas?.credential_type?.toLowerCase().includes(q) ||
      c.status.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="font-display text-lg">Issued Credentials</CardTitle>
          <Input
            placeholder="Search by holder DID, schema, status…"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            className="max-w-xs h-8 text-xs"
          />
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              {credentials.length === 0 ? "No credentials issued yet." : "No credentials match your search."}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {paginated.map((c) => (
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
                        {c.blockchain_anchor && (() => {
                          const bc = (c.credential_data as any)?.blockchain;
                          const txHash: string | undefined = bc?.txHash;
                          return (() => {
                            if (!txHash) return (
                              <span className="font-mono text-primary">⛓ {c.blockchain_anchor.substring(0, 20)}…</span>
                            );
                            const isMainnet = bc?.chainId && Number(bc.chainId) === 1;
                            const isLegacyPolygon = bc?.network === "polygon" || (bc?.chainId && [137, 80002].includes(Number(bc.chainId)));
                            const explorerBase = isMainnet
                              ? "https://etherscan.io"
                              : isLegacyPolygon
                                ? (Number(bc.chainId) === 80002 ? "https://amoy.polygonscan.com" : "https://polygonscan.com")
                                : AMOY_EXPLORER;
                            return (
                              <a
                                href={`${explorerBase}/tx/${txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 font-mono text-primary hover:underline"
                                title={txHash}
                              >
                                <Link2 className="h-3 w-3" />
                                ⛓ {txHash.substring(0, 20)}… ↗
                              </a>
                            );
                          })();
                        })()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        c.status === "active" ? "bg-accent text-accent-foreground" :
                        c.status === "expired" ? "bg-muted text-muted-foreground" :
                        "bg-destructive/10 text-destructive"
                      }`}>{c.status}</span>
                      {c.status === "active" && (
                        <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => setRevokeConfirmId(c.id)} disabled={revokingId === c.id}>
                          {revokingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Ban className="h-3 w-3 mr-1" /> Revoke</>}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">
                    {filtered.length} credential{filtered.length !== 1 ? "s" : ""} · Page {page + 1} of {totalPages}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Revoke confirmation */}
      <AlertDialog open={!!revokeConfirmId} onOpenChange={(open) => !open && setRevokeConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this credential?</AlertDialogTitle>
            <AlertDialogDescription>This action is permanent and cannot be undone. The credential will be marked as revoked on-chain.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (revokeConfirmId) {
                  onRevoke(revokeConfirmId);
                  setRevokeConfirmId(null);
                }
              }}
            >
              Revoke Credential
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CredentialDataGrid;
