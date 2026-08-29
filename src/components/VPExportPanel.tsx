import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Copy, Download, ExternalLink, QrCode, FileJson, Key, Link2, Loader2, ShieldCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { generateVP, type VPInput, type VPExportResult } from "@/lib/vpUtils";

interface VPExportPanelProps {
  vpInput: VPInput;
}

/**
 * Shows a Verifiable Presentation in 4 export formats:
 *   JSON  — W3C VerifiablePresentation object
 *   JWT   — Compact base64url-encoded signed token
 *   QR    — Scannable QR code containing the VP-JWT
 *   Chain — Link to the Etherscan on-chain anchor
 */
const VPExportPanel = ({ vpInput }: VPExportPanelProps) => {
  const { toast } = useToast();
  const [result, setResult] = useState<VPExportResult | null>(null);
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    setGenerating(true);
    try {
      const vp = await generateVP(vpInput);
      setResult(vp);
    } catch (err: any) {
      toast({ title: "VP generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
  };

  const downloadJson = (obj: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!result) {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <p className="text-xs text-muted-foreground text-center">
          Generate a cryptographically signed Verifiable Presentation to share in multiple formats.
        </p>
        <Button onClick={generate} disabled={generating} size="sm" variant="outline" className="gap-2">
          {generating
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating (sign in wallet)…</>
            : <><ShieldCheck className="h-3.5 w-3.5" /> Generate Verifiable Presentation</>
          }
        </Button>
      </div>
    );
  }

  const jsonStr = JSON.stringify(result.vpJson, null, 2);

  return (
    <div className="space-y-3">
      <Tabs defaultValue="qr">
        <TabsList className="w-full grid grid-cols-4 h-8">
          <TabsTrigger value="qr" className="text-xs gap-1">
            <QrCode className="h-3 w-3" /> QR
          </TabsTrigger>
          <TabsTrigger value="jwt" className="text-xs gap-1">
            <Key className="h-3 w-3" /> JWT
          </TabsTrigger>
          <TabsTrigger value="json" className="text-xs gap-1">
            <FileJson className="h-3 w-3" /> JSON
          </TabsTrigger>
          <TabsTrigger value="chain" className="text-xs gap-1">
            <Link2 className="h-3 w-3" /> Chain
          </TabsTrigger>
        </TabsList>

        {/* ── QR Tab ── */}
        <TabsContent value="qr" className="mt-3">
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 bg-white rounded-xl border border-border shadow-sm">
              <QRCodeSVG
                value={result.qrPayload}
                size={180}
                level="M"
                includeMargin={false}
              />
            </div>
            <p className="text-[10px] text-muted-foreground text-center max-w-xs">
              Verifier scans this QR to receive the VP-JWT. Works offline — no server needed.
            </p>
            <Button
              size="sm" variant="outline" className="gap-1 text-xs"
              onClick={() => copyText(result.qrPayload, "QR payload")}
            >
              <Copy className="h-3 w-3" /> Copy QR content
            </Button>
          </div>
        </TabsContent>

        {/* ── JWT Tab ── */}
        <TabsContent value="jwt" className="mt-3 space-y-2">
          <div className="bg-muted/50 rounded-lg border border-border/60 p-2 max-h-36 overflow-y-auto">
            <pre className="text-[9px] font-mono text-muted-foreground break-all whitespace-pre-wrap leading-relaxed">
              {result.vpJwt}
            </pre>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Self-contained signed token. Paste into any JWT decoder or present to APIs that accept Bearer tokens.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1 text-xs flex-1"
              onClick={() => copyText(result.vpJwt, "VP-JWT")}
            >
              <Copy className="h-3 w-3" /> Copy JWT
            </Button>
          </div>
        </TabsContent>

        {/* ── JSON Tab ── */}
        <TabsContent value="json" className="mt-3 space-y-2">
          <div className="bg-muted/50 rounded-lg border border-border/60 p-2 max-h-40 overflow-y-auto">
            <pre className="text-[9px] font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {jsonStr}
            </pre>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1 text-xs flex-1"
              onClick={() => copyText(jsonStr, "VP JSON")}
            >
              <Copy className="h-3 w-3" /> Copy JSON
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-xs flex-1"
              onClick={() => downloadJson(result.vpJson, "verifiable-presentation.json")}
            >
              <Download className="h-3 w-3" /> Download
            </Button>
          </div>
        </TabsContent>

        {/* ── Chain Tab ── */}
        <TabsContent value="chain" className="mt-3 space-y-3">
          {result.etherscanUrl ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                <ShieldCheck className="h-4 w-4 text-green-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">Anchored on Sepolia</p>
                  <p className="text-[10px] text-muted-foreground truncate">{vpInput.blockchainAnchor}</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Verifier can independently check this credential on the blockchain — no data sharing required.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1 text-xs flex-1" asChild>
                  <a href={result.etherscanUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3" /> View on Etherscan
                  </a>
                </Button>
                <Button size="sm" variant="outline" className="gap-1 text-xs flex-1"
                  onClick={() => copyText(result.etherscanUrl!, "Etherscan link")}
                >
                  <Copy className="h-3 w-3" /> Copy link
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-muted-foreground">
              <Link2 className="h-8 w-8 opacity-30" />
              <p className="text-xs text-center">No blockchain anchor found for this credential.</p>
              <p className="text-[10px] text-center">Anchor it first via the Issuer dashboard.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Button
        size="sm" variant="ghost" className="w-full text-xs text-muted-foreground gap-1"
        onClick={() => setResult(null)}
      >
        Regenerate VP
      </Button>
    </div>
  );
};

export default VPExportPanel;
