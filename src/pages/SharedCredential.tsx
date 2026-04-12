import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Shield, Clock, Link2, AlertTriangle, ArrowLeft, EyeOff } from "lucide-react";
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

  useEffect(() => {
    const fetchShared = async () => {
      if (!token) { setError("Invalid link"); setLoading(false); return; }

      const { data: share, error: err } = await supabase
        .from("credential_shares")
        .select("expires_at, credential_id, disclosed_fields")
        .eq("token", token)
        .single();

      if (err || !share) { setError("Share link not found or invalid"); setLoading(false); return; }
      if (new Date(share.expires_at) < new Date()) { setError("This share link has expired"); setLoading(false); return; }

      const { data: cred } = await supabase
        .from("credentials")
        .select("credential_data, credential_hash, blockchain_anchor, status, issued_at, credential_schemas(name, credential_type)")
        .eq("id", share.credential_id)
        .single();

      if (!cred) { setError("Credential not found"); setLoading(false); return; }

      setData({
        credential: cred as any,
        expiresAt: share.expires_at,
        disclosedFields: (share as any).disclosed_fields as string[] | null,
      });
      setLoading(false);
    };
    fetchShared();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading shared credential...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="font-display text-xl font-bold text-foreground">{error}</h2>
            <p className="text-sm text-muted-foreground">The credential share link may have expired or been removed.</p>
            <Link to="/"><Button variant="outline">Go to Homepage</Button></Link>
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

  // Filter fields based on selective disclosure
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

            {/* Selective Disclosure Notice */}
            {hasSelectiveDisclosure && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center gap-2 text-xs">
                <EyeOff className="h-4 w-4 text-primary shrink-0" />
                <span className="text-foreground">
                  <strong>Selective Disclosure:</strong> The holder has chosen to share {visibleEntries.length} of {Object.keys(subject).length} fields.
                  {hiddenCount > 0 && ` ${hiddenCount} field(s) are redacted.`}
                </span>
              </div>
            )}

            {/* Credential fields */}
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

            {/* Blockchain info */}
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
              Shared via DecentraID • Verified on Ethereum Sepolia
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SharedCredential;
