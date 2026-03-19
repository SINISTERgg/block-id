import { useEffect, useState } from "react";
import { Link2, Trash2, Clock, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface ShareLink {
  id: string;
  token: string;
  expires_at: string;
  created_at: string;
  credential_id: string;
  credentialName?: string;
}

const ActiveShareLinks = () => {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchLinks = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("credential_shares")
      .select("id, token, expires_at, created_at, credential_id")
      .eq("holder_id", user.id)
      .order("created_at", { ascending: false });

    if (!data) { setLoading(false); return; }

    const credIds = [...new Set(data.map(d => d.credential_id))];
    const { data: creds } = await supabase
      .from("credentials")
      .select("id, credential_schemas(name)")
      .in("id", credIds);

    const nameMap: Record<string, string> = {};
    creds?.forEach((c: any) => { nameMap[c.id] = c.credential_schemas?.name || "Credential"; });

    setLinks(data.map(d => ({ ...d, credentialName: nameMap[d.credential_id] })));
    setLoading(false);
  };

  useEffect(() => { fetchLinks(); }, [user]);

  const revokeLink = async (id: string) => {
    setRevoking(id);
    const { error } = await supabase.from("credential_shares").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Share link revoked" });
      setLinks(prev => prev.filter(l => l.id !== id));
    }
    setRevoking(null);
  };

  const activeLinks = links.filter(l => new Date(l.expires_at) > new Date());
  const expiredLinks = links.filter(l => new Date(l.expires_at) <= new Date());

  if (loading) {
    return (
      <Card className="glass-card border-0 rounded-2xl overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" /> Share Links
          </CardTitle>
          <Skeleton className="h-4 w-14" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="border border-border/60 rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-7 w-7 rounded-md" />
                  <Skeleton className="h-7 w-7 rounded-md" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" /> Share Links
        </CardTitle>
        <span className="text-xs text-muted-foreground">{activeLinks.length} active</span>
      </CardHeader>
      <CardContent>
        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No share links yet. Use the share icon on a credential to create one.
          </p>
        ) : (
          <div className="space-y-3">
            {activeLinks.map(link => (
              <div key={link.id} className="border border-border/60 rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{link.credentialName}</p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      <Clock className="h-3 w-3" />
                      Expires {new Date(link.expires_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <a
                      href={`/shared/${link.token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-md hover:bg-muted transition-colors"
                      title="Open link"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => revokeLink(link.id)}
                      disabled={revoking === link.id}
                      title="Revoke link"
                    >
                      {revoking === link.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      }
                    </Button>
                  </div>
                </div>
                <p className="text-[10px] font-mono text-muted-foreground truncate">
                  {window.location.origin}/shared/{link.token}
                </p>
              </div>
            ))}
            {expiredLinks.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-2">Expired ({expiredLinks.length})</p>
                {expiredLinks.map(link => (
                  <div key={link.id} className="flex items-center justify-between py-1.5 opacity-50">
                    <div>
                      <p className="text-xs text-foreground">{link.credentialName}</p>
                      <p className="text-[10px] text-muted-foreground">Expired {new Date(link.expires_at).toLocaleDateString()}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => revokeLink(link.id)}
                      disabled={revoking === link.id}
                      title="Remove"
                    >
                      {revoking === link.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Trash2 className="h-3 w-3 text-destructive" />
                      }
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ActiveShareLinks;
