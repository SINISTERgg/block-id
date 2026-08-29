import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExternalLink, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface QRCodeDisplayProps {
  value: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const QRCodeDisplay = ({ value, title, open, onOpenChange }: QRCodeDisplayProps) => {
  const [copied, setCopied] = useState(false);
  const isUrl = value.startsWith("http://") || value.startsWith("https://");
  const isDid = value.startsWith("did:");

  // For QR encoding: use value as-is (it should be a URL or DID now, not raw JSON)
  const qrValue = value || " ";

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayLabel = () => {
    if (isUrl) {
      // Show just the path/token part for share links, or trim long URLs
      try {
        const url = new URL(value);
        const path = url.pathname + url.search;
        return path.length > 40 ? `${url.host}${path.substring(0, 30)}…` : `${url.host}${path}`;
      } catch {
        return value.length > 50 ? value.substring(0, 50) + "…" : value;
      }
    }
    if (isDid) return value.length > 50 ? value.substring(0, 50) + "…" : value;
    return value.length > 50 ? value.substring(0, 50) + "…" : value;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="font-display text-center">{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-border/30">
            <QRCodeSVG value={qrValue} size={200} level="M" includeMargin={false} />
          </div>

          <div className="w-full bg-muted rounded-lg px-3 py-2 flex items-center gap-2">
            <p className="text-xs text-muted-foreground font-mono break-all flex-1 text-center leading-relaxed">
              {displayLabel()}
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={handleCopy}
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
          </div>

          {isUrl && (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Open link
            </a>
          )}

          <p className="text-[10px] text-muted-foreground text-center">
            Scan with any QR scanner or camera app
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QRCodeDisplay;
