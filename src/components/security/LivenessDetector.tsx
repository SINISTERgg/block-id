/**
 * Phase 8 — LivenessDetector.
 *
 * Captures a short webcam session, downsamples frames to luma grids, and
 * scores liveness client-side (src/lib/biometrics/liveness.ts). Frames never
 * leave the device except the single final selfie, which goes to the
 * `biometric-verify` edge function as an ephemeral base64 payload.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ScanFace } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  LIVENESS_MIN_FRAMES,
  evaluateLiveness,
  type LivenessResult,
} from "@/lib/biometrics/liveness";

/** Downsampled grid resolution per frame. */
const GRID = 32;
/** Interval between captured frames (ms) — ~5 fps keeps the loop cheap. */
const SAMPLE_INTERVAL_MS = 200;
/** Cap on stored frames (≈2.4 s at 200 ms). */
const MAX_FRAMES = 12;

interface Props {
  onComplete: (result: LivenessResult & { selfieDataUrl: string }) => void;
  onError?: (message: string) => void;
  className?: string;
}

interface LumaFrame {
  dataUrl: string;
  grid: number[];
}

async function captureLumaFrame(video: HTMLVideoElement): Promise<LumaFrame> {
  const canvas = document.createElement("canvas");
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, GRID, GRID);
  const { data } = ctx.getImageData(0, 0, GRID, GRID);

  const grid: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    // Rec.709-ish luma approximation is plenty for variance/motion stats.
    grid.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
  }

  // Full-resolution selfie (JPEG) for the server round-trip.
  const full = document.createElement("canvas");
  full.width = video.videoWidth || 480;
  full.height = video.videoHeight || 360;
  full.getContext("2d")!.drawImage(video, 0, 0);
  return { dataUrl: full.toDataURL("image/jpeg", 0.8), grid };
}

const LivenessDetector = ({ onComplete, onError, className }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const framesRef = useRef<LumaFrame[]>([]);
  const timerRef = useRef<number | null>(null);

  const [active, setActive] = useState(false);
  const [framesCaptured, setFramesCaptured] = useState(0);
  const [result, setResult] = useState<LivenessResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const finish = useCallback(
    (finalFrames: LumaFrame[]) => {
      stopCamera();
      const verdict = evaluateLiveness(finalFrames.map((f) => f.grid));
      setResult(verdict);
      if (verdict.passed) {
        const lastSelfie = finalFrames[finalFrames.length - 1].dataUrl;
        onComplete({ ...verdict, selfieDataUrl: lastSelfie });
      } else if (onError) {
        onError(verdict.reasons.join("; ") || `Liveness score too low (${verdict.score})`);
      }
    },
    [onComplete, onError, stopCamera]
  );

  const start = useCallback(async () => {
    setError(null);
    setResult(null);
    framesRef.current = [];
    setFramesCaptured(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 480, height: 360 },
        audio: false,
      });
      streamRef.current = stream;
      setActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      timerRef.current = window.setInterval(async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return;
        const frame = await captureLumaFrame(video);
        framesRef.current.push(frame);
        setFramesCaptured(framesRef.current.length);
        if (framesRef.current.length >= MAX_FRAMES) finish(framesRef.current);
      }, SAMPLE_INTERVAL_MS);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Camera access denied";
      setError(message);
      onError?.(message);
      stopCamera();
    }
  }, [finish, onError, stopCamera]);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanFace className="h-4 w-4" /> Liveness check
        </CardTitle>
        <CardDescription>
          Look at the camera and move naturally for ~{Math.ceil((MAX_FRAMES * SAMPLE_INTERVAL_MS) / 1000)}s.
          Frames stay on your device; only verification hashes are stored.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative overflow-hidden rounded-lg border bg-muted aspect-video">
          <video
            ref={videoRef}
            muted
            playsInline
            className={`h-full w-full scale-x-[-1] object-cover ${active ? "" : "opacity-30"}`}
          />
          {!active && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
              Camera off
            </div>
          )}
        </div>

        <Progress value={(framesCaptured / LIVENESS_MIN_FRAMES) * 100} className="h-1.5" />

        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1 text-sm">
            <p className={result.passed ? "text-emerald-500" : "text-destructive"}>
              Liveness score: <strong>{result.score}/100</strong> ({result.framesAnalyzed} frames)
            </p>
            {result.reasons.map((r) => (
              <p key={r} className="text-xs text-muted-foreground">• {r}</p>
            ))}
          </motion.div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={start} disabled={active} className="w-full gap-2">
          <Camera className="h-4 w-4" />
          {result?.passed ? "Re-run check" : active ? "Recording…" : "Start liveness check"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default LivenessDetector;
