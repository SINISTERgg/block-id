import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { Shield, Clock, Link2, AlertTriangle, ArrowLeft, EyeOff, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface SharedData {
  credential: {
    credential_data: any;
    credential_hash: string;
    blockchain_anchor: string | null;
    status: string;
    issued_at: string;
    credential_schemas: { name: string; credential_type: string } | null;
  };
  expiresAt: string;
  disclosedFields: string[] | null;
}

const SharedCredential = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  const handleRetry = useCallback(() => {
    setError(null);
    setData(null);
    setLoading(true);
    setRetryCount((c) => c + 1);
  }, []);

  useEffect(() => {
    const fetchShared = async () => {
      if (!token) { setError("Invalid link"); setLoading(false); return; }

      // Primary path: SECURITY DEFINER RPC validates token server-side.
      try {
        const { data: rpcData, error: rpcError } = await supabase
          .rpc("get_shared_credential", { p_token: token })
          .single();

        if (rpcError) {
          const isMissingFn =
            rpcError.code === "PGRST202" ||
            rpcError.message?.includes("function") ||
            rpcError.message?.includes("42883");

          if (!isMissingFn) {
            console.warn("[SharedCredential] RPC error:", rpcError);
            setError("Share link not found or invalid");
            setLoading(false);
            return;
          }
          console.warn("[SharedCredential] RPC not found, trying direct query:", rpcError.message);
        } else if (rpcData) {
          setData({
            credential: {
              credential_data: rpcData.credential_data,
              credential_hash: rpcData.credential_hash,
              blockchain_anchor: rpcData.blockchain_anchor,
              status: rpcData.status,
              issued_at: rpcData.issued_at,
              credential_schemas: rpcData.schema_name
                ? { name: rpcData.schema_name, credential_type: rpcData.schema_type }
                : null,
            },
            expiresAt: rpcData.expires_at,
            disclosedFields: rpcData.disclosed_fields as string[] | null,
          });
          setLoading(false);
          return;
        } else {
          setError("Share link not found or expired");
          setLoading(false);
          return;
        }
      } catch (rpcEx: any) {
        console.warn("[SharedCredential] RPC exception:", rpcEx);
      }

      // Fallback: direct table join for authenticated holders.
      try {
        const { data: shareRow, error: shareErr } = await supabase
          .from("credential_shares")
          .select(`
            expires_at,
            disclosed_fields,
            credentials (
              credential_data,
              credential_hash,
              blockchain_anchor,
              status,
              issued_at,
              credential_schemas ( name, credential_type )
            )
          `)
          .eq("token", token)
          .gt("expires_at", new Date().toISOString())
          .single();

        if (shareErr || !shareRow || !shareRow.credentials) {
          console.warn("[SharedCredential] Direct query failed:", shareErr);
          setError("Share link not found or expired");
          setLoading(false);
          return;
        }

        const cred = shareRow.credentials as any;
        setData({
          credential: {
            credential_data: cred.credential_data,
            credential_hash: cred.credential_hash,
            blockchain_anchor: cred.blockchain_anchor,
            status: cred.status,
            issued_at: cred.issued_at,
            credential_schemas: cred.credential_schemas
              ? { name: cred.credential_schemas.name, credential_type: cred.credential_schemas.credential_type }
              : null,
          },
          expiresAt: shareRow.expires_at,
          disclosedFields: shareRow.disclosed_fields as string[] | null,
        });
      } catch (fallbackErr: any) {
        console.error("[SharedCredential] Fallback exception:", fallbackErr);
        setError("Share link not found or expired");
      } finally {
        setLoading(false);
      }
    };

    fetchShared();
  }, [token, retryCount]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm">Loading shared credential...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-destructive/20">
          <CardContent className="pt-8 pb-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-foreground mb-1">{error}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The share link may have expired, been revoked, or the URL may be incomplete.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={handleRetry}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
              <Link to="/">
                <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors">
                  Go to Homepage
                </button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;
  const { credential, expiresAt, disclosedFields } = data;
  const credData = credential.credential_data as Record<string, any>;
  const subject = credData?.credentialSubject || {};
  const hasSelectiveDisclosure = disclosedFields && disclosedFields.length > 0;

  const visibleEntries = Object.entries(subject).filter(([key]) => {
    if (!hasSelectiveDisclosure) return true;
    return disclosedFields.includes(key);
  });

  const hiddenCount = hasSelectiveDisclosure
    ? Object.keys(subject).length - visibleEntries.length
    : 0;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Home
            </Button>
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Expires {new Date(expiresAt).toLocaleString()}
          </div>
        </div>

        <Card className="border-primary/20">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="font-display">{credential.credential_schemas?.name || "Credential"}</CardTitle>
              <p className="text-sm text-muted-foreground">{credential.credential_schemas?.credential_type}</p>
            </div>
            <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
              credential.status === "active" ? "bg-accent text-accent-foreground" :
              credential.status === "expired" ? "bg-muted text-muted-foreground" :
              "bg-destructive/10 text-destructive"
            }`}>{credential.status}</span>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p>Issued: {new Date(credential.issued_at).toLocaleDateString()}</p>
              {credData?.expirationDate && (
                <p>Expires: {new Date(credData.expirationDate).toLocaleDateString()}</p>
              )}
            </div>

            {hasSelectiveDisclosure && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center gap-2 text-xs">
                <EyeOff className="h-4 w-4 text-primary shrink-0" />
                <span className="text-foreground">
                  <strong>Selective Disclosure:</strong> The holder chose to share {visibleEntries.length} of {Object.keys(subject).length} fields.
                  {hiddenCount > 0 && ` ${hiddenCount} field(s) are redacted.`}
                </span>
              </div>
            )}

            <div className="border rounded-lg divide-y">
              {visibleEntries.map(([key, val]) => (
                <div key={key} className="flex justify-between px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                  <span className="font-medium text-foreground">{String(val)}</span>
                </div>
              ))}
              {hiddenCount > 0 && (
                <div className="flex justify-between px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground italic flex items-center gap-1">
                    <EyeOff className="h-3 w-3" /> {hiddenCount} redacted field(s)
                  </span>
                  <span className="text-muted-foreground">•••</span>
                </div>
              )}
            </div>

            {credential.blockchain_anchor && (
              <div className="bg-muted rounded-lg p-3 text-xs font-mono space-y-1">
                <p className="flex items-center gap-1.5">
                  <Link2 className="h-3 w-3 text-primary" />
                  <span className="text-muted-foreground">Anchor:</span> {credential.blockchain_anchor}
                </p>
              </div>
            )}

            <div className="bg-muted rounded-lg p-3 text-xs font-mono">
              <span className="text-muted-foreground">Hash:</span> {credential.credential_hash}
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Shared via BlockID • Verified on Ethereum Sepolia
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SharedCredential;
