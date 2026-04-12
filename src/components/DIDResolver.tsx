import { useState } from "react";
import { FileText, Search, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DIDResolverProps {
  compact?: boolean;
}

const DIDResolver = ({ compact = false }: DIDResolverProps) => {
  const [did, setDid] = useState("");
  const [resolving, setResolving] = useState(false);
  const [didDocument, setDidDocument] = useState<any>(null);
  const { toast } = useToast();

  const resolveDID = async () => {
    if (!did.trim()) return;
    setResolving(true);
    setDidDocument(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-did`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ did }),
        }
      );
      const data = await res.json();
      if (data.error) {
        toast({ title: "Resolution failed", description: data.error, variant: "destructive" });
      } else {
        setDidDocument(data.didDocument);
      }
    } catch {
      toast({ title: "Error", description: "Failed to resolve DID", variant: "destructive" });
    }
    setResolving(false);
  };

  if (compact) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-foreground">DID Resolver</h3>
              <p className="text-xs text-muted-foreground">W3C DID Document</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              value={did}
              onChange={(e) => setDid(e.target.value)}
              placeholder="did:decentraid:..."
              className="text-xs"
            />
            <Button variant="outline" size="sm" onClick={resolveDID} disabled={resolving}>
              {resolving ? "..." : "Resolve"}
            </Button>
          </div>
          {didDocument && (
            <pre className="mt-3 text-[10px] font-mono bg-muted rounded-lg p-2 overflow-auto max-h-40">
              {JSON.stringify(didDocument, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" /> W3C DID Document Resolver
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Decentralized Identifier</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={did}
              onChange={(e) => setDid(e.target.value)}
              placeholder="did:decentraid:... or did:ethr:sepolia:0x..."
              className="font-mono text-sm"
            />
            <Button onClick={resolveDID} disabled={resolving}>
              <Search className="h-4 w-4 mr-1" />
              {resolving ? "Resolving..." : "Resolve"}
            </Button>
          </div>
        </div>

        {didDocument && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4 text-primary" />
              <span className="font-display font-semibold text-foreground">DID Document</span>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="bg-muted rounded-lg p-2">
                <p className="text-muted-foreground">ID</p>
                <p className="font-mono text-foreground break-all">{didDocument.id}</p>
              </div>
              <div className="bg-muted rounded-lg p-2">
                <p className="text-muted-foreground">Controller</p>
                <p className="font-mono text-foreground break-all">{didDocument.controller}</p>
              </div>
            </div>

            {/* Verification Methods */}
            {didDocument.verificationMethod?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Verification Methods</p>
                {didDocument.verificationMethod.map((vm: any, i: number) => (
                  <div key={i} className="bg-muted rounded-lg p-2 mb-1 text-xs">
                    <p className="font-mono text-foreground">{vm.id}</p>
                    <p className="text-muted-foreground">Type: {vm.type}</p>
                    {vm.blockchainAccountId && (
                      <p className="text-primary font-mono">Chain: {vm.blockchainAccountId}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Trust info */}
            {didDocument.metadata?.trusted && (
              <div className="bg-accent/20 rounded-lg p-2 text-xs">
                <p className="font-semibold text-accent-foreground">✓ Trusted Issuer</p>
                <p className="text-muted-foreground">
                  Status: {didDocument.metadata.trusted.status} | Level: {didDocument.metadata.trusted.level}
                </p>
              </div>
            )}

            {/* Raw JSON */}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                View raw JSON
              </summary>
              <pre className="mt-2 font-mono bg-muted rounded-lg p-3 overflow-auto max-h-64 text-[10px]">
                {JSON.stringify(didDocument, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DIDResolver;
