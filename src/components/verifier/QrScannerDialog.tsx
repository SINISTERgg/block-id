/**
 * QrScannerDialog — reads a holder's presentation QR code with the camera.
 *
 * Uses the native `BarcodeDetector` where the browser provides it (Chromium on
 * desktop and Android) instead of pulling in a WASM decoder. Where it is
 * unavailable the dialog degrades to manual entry rather than failing: the
 * paste-a-VP path in VerifyView always remains available, so scanning is a
 * convenience, never a gate.
 *
 * The camera stream is stopped on every exit path (close, unmount, error) —
 * a scanner that keeps the camera light on after the dialog closes is a bug
 * users notice immediately.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { QrCode, Camera, CameraOff, Copy, Check, Loader2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

/** Minimal shape of the native BarcodeDetector we depend on. */
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return typeof w.BarcodeDetector === "function" ? w.BarcodeDetector : null;
}

interface QrScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (payload: string) => void;
}

const QrScannerDialog = ({ open, onOpenChange, onScan }: QrScannerDialogProps) => {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  const [supported, setSupported] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const start = useCallback(async () => {
    const Ctor = getBarcodeDetectorCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setError(null);
    doneRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setScanning(true);

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();

      const detector = new Ctor({ formats: ["qr_code"] });
      const tick = async () => {
        if (doneRef.current) return;
        try {
          if (video.readyState >= 2) {
            const codes = await detector.detect(video);
            const value = codes.find((c) => c.rawValue)?.rawValue;
            if (value) {
              doneRef.current = true;
              onScan(value);
              toast({ title: "QR code scanned", description: "Presentation loaded into the verifier." });
              onOpenChange(false);
              return;
            }
          }
        } catch {
          // A single failed detect() is normal mid-exposure; keep polling.
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      stop();
      setError(
        err instanceof Error
          ? err.name === "NotAllowedError"
            ? "Camera permission denied — allow access or paste the payload below."
            : err.message
          : "Could not start the camera."
      );
    }
  }, [onOpenChange, onScan, stop, toast]);

  // Start on open, stop on close/unmount.
  useEffect(() => {
    if (open) {
      const Ctor = getBarcodeDetectorCtor();
      setSupported(!!Ctor);
      if (Ctor) void start();
    } else {
      stop();
    }
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [open, start, stop]);

  const submitManual = () => {
    if (!manual.trim()) return;
    onScan(manual.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-verifier" /> Scan presentation QR
          </DialogTitle>
          <DialogDescription>
            Point the camera at the holder&apos;s QR code. BlockID decodes it locally — no
            image ever leaves this device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {supported ? (
            <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-border bg-black">
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              {!scanning && !error ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Button variant="secondary" className="gap-2" onClick={start}>
                    <Camera className="h-4 w-4" /> Start camera
                  </Button>
                </div>
              ) : null}
              {scanning ? (
                <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-verifier/70" />
              ) : null}
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-3 text-[11px] text-muted-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              <span>
                This browser has no native QR decoder. Paste the payload below, or use the
                text area in the verifier.
              </span>
            </div>
          )}

          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[11px] text-destructive">
              <CameraOff className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Or paste the payload</Label>
            <Textarea
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              rows={4}
              className="font-mono text-xs input-solid"
              placeholder="did://… or a VP JSON payload"
            />
            <div className="flex gap-2">
              <Button className="btn-primary flex-1 gap-2" onClick={submitManual} disabled={!manual.trim()}>
                <Check className="h-4 w-4" /> Use payload
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  navigator.clipboard.writeText(manual);
                  toast({ title: "Copied" });
                }}
                disabled={!manual.trim()}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {scanning ? (
            <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Decoding locally in this tab.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QrScannerDialog;
