import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExternalLink } from "lucide-react";

interface QRCodeDisplayProps {
  value: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const QRCodeDisplay = ({ value, title, open, onOpenChange }: QRCodeDisplayProps) => {
  const isUrl = value.startsWith("http://") || value.startsWith("https://");
  const displayText = value.length > 60 ? value.substring(0, 60) + "…" : value;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="font-display text-center">{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <QRCodeSVG value={value} size={200} level="M" />
          </div>
          {isUrl ? (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary font-mono break-all text-center max-w-[220px] hover:underline"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              {displayText}
            </a>
          ) : (
            <p className="text-xs text-muted-foreground font-mono break-all text-center max-w-[220px]">
              {displayText}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QRCodeDisplay;
