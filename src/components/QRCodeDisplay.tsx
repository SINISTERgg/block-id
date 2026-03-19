import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface QRCodeDisplayProps {
  value: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const QRCodeDisplay = ({ value, title, open, onOpenChange }: QRCodeDisplayProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-xs">
      <DialogHeader>
        <DialogTitle className="font-display text-center">{title}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="bg-white p-4 rounded-lg">
          <QRCodeSVG value={value} size={200} level="M" />
        </div>
        <p className="text-xs text-muted-foreground font-mono break-all text-center max-w-[200px]">{value}</p>
      </div>
    </DialogContent>
  </Dialog>
);

export default QRCodeDisplay;
