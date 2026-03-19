import { useState } from "react";
import { Download, FileJson, FileText, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface CredentialExportProps {
  credential: {
    id: string;
    credential_data: any;
    credential_hash: string;
    blockchain_anchor: string | null;
    status: string;
    issued_at: string;
    credential_schemas: { name: string; credential_type: string } | null;
  };
  holderDid: string;
}

const CredentialExport = ({ credential, holderDid }: CredentialExportProps) => {
  const [exported, setExported] = useState<string | null>(null);
  const { toast } = useToast();

  const exportAsJsonLD = () => {
    const vc = credential.credential_data;
    const jsonLD = {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      ...vc,
      id: `urn:uuid:${credential.id}`,
      credentialStatus: {
        id: `urn:decentraid:status:${credential.id}`,
        type: "StatusList2021Entry",
        statusPurpose: "revocation",
        statusListIndex: "0",
      },
    };

    downloadJson(jsonLD, `credential-${credential.id.substring(0, 8)}.jsonld`);
    setExported("jsonld");
    setTimeout(() => setExported(null), 2000);
  };

  const exportAsJwtVC = () => {
    const vc = credential.credential_data;
    // Build a JWT-VC compatible payload (unsigned - for portability)
    const header = { alg: "ES256K", typ: "JWT" };
    const payload = {
      iss: vc?.issuer || "",
      sub: holderDid,
      iat: Math.floor(new Date(credential.issued_at).getTime() / 1000),
      nbf: Math.floor(new Date(credential.issued_at).getTime() / 1000),
      exp: vc?.expirationDate ? Math.floor(new Date(vc.expirationDate).getTime() / 1000) : undefined,
      jti: `urn:uuid:${credential.id}`,
      vc: {
        "@context": vc?.["@context"] || ["https://www.w3.org/2018/credentials/v1"],
        type: vc?.type || ["VerifiableCredential"],
        credentialSubject: vc?.credentialSubject || {},
        credentialSchema: vc?.credentialSchema,
      },
    };

    const jwtParts = [
      btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"),
      btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"),
      "UNSIGNED_EXPORT", // Placeholder - real signing happens with wallet
    ];

    const jwt = jwtParts.join(".");

    const blob = new Blob([jwt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `credential-${credential.id.substring(0, 8)}.jwt`;
    a.click();
    URL.revokeObjectURL(url);
    setExported("jwt");
    setTimeout(() => setExported(null), 2000);
    toast({ title: "Exported as JWT-VC" });
  };

  const downloadJson = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported as JSON-LD" });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button title="Export credential">
          <Download className="h-4 w-4 text-muted-foreground hover:text-primary" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" /> Export Credential
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <p className="text-sm text-muted-foreground">
            Export <strong className="text-foreground">{credential.credential_schemas?.name}</strong> in a portable format.
          </p>

          <Button variant="outline" className="w-full justify-start gap-3" onClick={exportAsJsonLD}>
            <FileJson className="h-5 w-5 text-primary" />
            <div className="text-left flex-1">
              <p className="text-sm font-medium">JSON-LD</p>
              <p className="text-xs text-muted-foreground">W3C Verifiable Credential format</p>
            </div>
            {exported === "jsonld" && <Check className="h-4 w-4 text-primary" />}
          </Button>

          <Button variant="outline" className="w-full justify-start gap-3" onClick={exportAsJwtVC}>
            <FileText className="h-5 w-5 text-primary" />
            <div className="text-left flex-1">
              <p className="text-sm font-medium">JWT-VC</p>
              <p className="text-xs text-muted-foreground">Compact JWT token format</p>
            </div>
            {exported === "jwt" && <Check className="h-4 w-4 text-primary" />}
          </Button>

          <p className="text-[10px] text-muted-foreground text-center">
            Exported credentials can be imported into other W3C-compatible wallets
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CredentialExport;
