import { QrCode, Share2, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ActiveShareLinks from "@/components/ActiveShareLinks";
import PrivacyCenter from "@/components/PrivacyCenter";
import type { HolderCredential } from "@/services/api/holder.service";

interface PresentViewProps {
  credentials: HolderCredential[];
  holderDid: string | undefined;
  onShowQR: (value: string, title: string) => void;
  onCopy: (text: string) => void;
  onShareCred: (id: string, name: string, fields: string[]) => void;
}

const PresentView = ({ credentials, holderDid, onShowQR, onCopy, onShareCred }: PresentViewProps) => {
  const activeCredentials = credentials.filter((c) => c.status === "active");

  const createPresentation = (cred: HolderCredential) => JSON.stringify({
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiablePresentation"],
    holder: holderDid,
    verifiableCredential: { ...(cred.credential_data as any), id: cred.id },
    credential_id: cred.id,
  });

  return (
    <>
      <h2 className="text-xl font-display font-semibold text-foreground">Present Credentials</h2>

      {activeCredentials.length === 0 ? (
        <Card><CardContent className="py-12"><div className="flex items-center justify-center text-muted-foreground text-sm">No active credentials to present.</div></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {activeCredentials.map((cred) => (
            <Card key={cred.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-display font-semibold text-foreground">{cred.credential_schemas?.name || "Credential"}</h4>
                    <p className="text-xs text-muted-foreground">{cred.credential_schemas?.credential_type}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground">active</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => onShowQR(createPresentation(cred), cred.credential_schemas?.name || "Credential")}>
                    <QrCode className="h-3 w-3" /> Show QR
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => onCopy(createPresentation(cred))}>
                    <Share2 className="h-3 w-3" /> Copy VP
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => {
                    const subject = (cred.credential_data as any)?.credentialSubject;
                    onShareCred(cred.id, cred.credential_schemas?.name || "Credential", subject ? Object.keys(subject) : []);
                  }}>
                    <ExternalLink className="h-3 w-3" /> Share Link
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ActiveShareLinks />
      <PrivacyCenter />
    </>
  );
};

export default PresentView;
