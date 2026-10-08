import React, { Component, ReactNode, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { QrCode, Copy, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface SafeQRCodeProps {
  value: string;
  size?: number;
  level?: "L" | "M" | "Q" | "H";
  includeMargin?: boolean;
  className?: string;
}

interface ErrorBoundaryProps {
  fallback: (error: Error) => ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class QRErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.warn("[SafeQRCode] Caught QR rendering error:", error.message);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error);
    }
    return this.props.children;
  }
}

/**
 * Safe wrapper around QRCodeSVG.
 * - Enforces length boundaries to prevent `Data too long` runtime crashes.
 * - Wraps QRCodeSVG in a local ErrorBoundary so an unexpected error during
 *   QR matrix calculation NEVER crashes the host view or parent dialog.
 * - Displays a helpful copy fallback if data cannot fit in a QR code.
 */
export const SafeQRCode: React.FC<SafeQRCodeProps> = ({
  value,
  size = 180,
  level = "L",
  includeMargin = false,
  className,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderFallback = (errText?: string) => (
    <div
      style={{ width: size, height: size }}
      className={`flex flex-col items-center justify-center p-3 text-center border border-dashed border-border rounded-lg bg-muted/40 ${className || ""}`}
    >
      <AlertTriangle className="h-6 w-6 text-amber-500 mb-1.5 shrink-0" />
      <p className="text-[11px] font-medium text-foreground leading-tight mb-1">
        Data exceeds QR capacity
      </p>
      <p className="text-[9px] text-muted-foreground mb-2">
        {errText ? "Payload too long to encode" : `Payload is ${value.length} characters`}
      </p>
      <Button
        size="sm"
        variant="outline"
        className="h-6 text-[10px] px-2 gap-1"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy Payload"}
      </Button>
    </div>
  );

  if (!value || typeof value !== "string" || value.trim() === "") {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex flex-col items-center justify-center p-2 text-center border border-dashed border-border rounded-lg bg-muted/20 ${className || ""}`}
      >
        <QrCode className="h-6 w-6 text-muted-foreground mb-1" />
        <span className="text-[10px] text-muted-foreground">No data to display</span>
      </div>
    );
  }

  // Maximum binary QR limit at level L is ~2953 bytes
  if (value.length > 2900) {
    return renderFallback();
  }

  return (
    <QRErrorBoundary fallback={(err) => renderFallback(err.message)}>
      <QRCodeSVG
        value={value}
        size={size}
        level={level}
        includeMargin={includeMargin}
        className={className}
      />
    </QRErrorBoundary>
  );
};

export default SafeQRCode;
