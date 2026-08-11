import { useRef, useCallback } from "react";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import jsPDF from "jspdf";
import { Download, FileImage, Printer, Shield, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface CertificateData {
  credentialName: string;
  credentialType: string;
  holderName: string;
  holderDid: string;
  issuedAt: string;
  status: string;
  credentialHash: string;
  blockchainAnchor: string | null;
  credentialData: Record<string, any>;
  issuerName?: string;
}

interface CertificateRendererProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  certificate: CertificateData | null;
}

/**
 * Constructs a verification URL from a credential hash.
 * This URL can be embedded in QR codes for instant verification.
 */
function getVerificationUrl(hash: string): string {
  const base = typeof window !== "undefined" ? window.location.origin : "https://blockid.app";
  return `${base}/verify?hash=${encodeURIComponent(hash)}`;
}

/**
 * Extract displayable credential fields, skipping internal/meta fields.
 */
function extractDisplayFields(data: Record<string, any>): [string, string][] {
  // Fields to completely skip (internal/meta/complex object fields)
  const skip = new Set([
    "@context", "type", "id", "issuer", "issuanceDate", "expirationDate",
    "proof", "credentialHash", "blockchain", "previousHash", "credentialSchema",
    "credentialStatus", "refreshService", "termsOfUse", "evidence",
  ]);
  const entries: [string, string][] = [];

  // Flatten credentialSubject if present — skip nested objects
  const subject = data.credentialSubject;
  if (subject && typeof subject === "object") {
    Object.entries(subject).forEach(([k, v]) => {
      if (k === "id") return;
      if (v === undefined || v === null || v === "") return;
      // Skip complex nested objects
      if (typeof v === "object" && !Array.isArray(v)) return;
      const strVal = Array.isArray(v) ? v.join(", ") : String(v);
      entries.push([k, strVal]);
    });
  }

  // Add top-level non-meta fields (only primitives)
  Object.entries(data).forEach(([k, v]) => {
    if (skip.has(k) || k === "credentialSubject") return;
    if (v === undefined || v === null || v === "") return;
    if (typeof v === "object" && !Array.isArray(v)) return;
    const strVal = Array.isArray(v) ? v.join(", ") : String(v);
    entries.push([k, strVal]);
  });

  return entries.slice(0, 10);
}

/**
 * Format a camelCase or snake_case field name into a readable label.
 */
function formatFieldLabel(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

/**
 * CertificateRenderer — Phase II Visual SVG/PDF Certificate with embedded Anti-Counterfeit QR Code.
 *
 * Renders a high-quality visual certificate inside a modal dialog.
 * - SVG-based rendering for crisp display at any resolution
 * - Embedded QR code linking to the verification URL (contains credential hash)
 * - One-click PDF export with anti-counterfeit QR embedded
 * - One-click SVG download
 * - Print-friendly layout
 */
const CertificateRenderer = ({ open, onOpenChange, certificate }: CertificateRendererProps) => {
  const svgContainerRef = useRef<HTMLDivElement>(null);

  // ─── All derived values (null-safe) ─────────────────────────────────
  const verificationUrl = certificate ? getVerificationUrl(certificate.credentialHash) : "";
  const displayFields = certificate ? extractDisplayFields(certificate.credentialData) : [];
  const issueDate = certificate
    ? new Date(certificate.issuedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";
  const issuerLabel = certificate?.issuerName || "BlockID Verified Issuer";

  // ─── PDF Export (with embedded QR) ──────────────────────────────────
  const exportPdf = useCallback(() => {
    if (!certificate) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();

    // Background
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, w, h, "F");

    // Outer border
    doc.setDrawColor(99, 102, 241);
    doc.setLineWidth(1.2);
    doc.roundedRect(8, 8, w - 16, h - 16, 4, 4, "S");

    // Inner border
    doc.setDrawColor(55, 65, 81);
    doc.setLineWidth(0.4);
    doc.roundedRect(12, 12, w - 24, h - 24, 3, 3, "S");

    // Top accent bar
    doc.setFillColor(99, 102, 241);
    doc.rect(12, 12, w - 24, 3, "F");

    // "BLOCKID" small header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(99, 102, 241);
    doc.text("BLOCKID VERIFIED CREDENTIAL", w / 2, 25, { align: "center" });

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.setTextColor(248, 250, 252);
    doc.text("CERTIFICATE OF CREDENTIAL", w / 2, 38, { align: "center" });

    // Decorative line
    doc.setDrawColor(99, 102, 241);
    doc.setLineWidth(0.6);
    doc.line(w / 2 - 45, 43, w / 2 + 45, 43);

    // Credential name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(165, 180, 252);
    doc.text(certificate.credentialName, w / 2, 55, { align: "center" });

    // Type badge
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text(certificate.credentialType.toUpperCase(), w / 2, 62, { align: "center" });

    // "This certifies that"
    doc.setFontSize(11);
    doc.setTextColor(148, 163, 184);
    doc.text("This is to certify that", w / 2, 74, { align: "center" });

    // Holder name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(248, 250, 252);
    doc.text(certificate.holderName || "Credential Holder", w / 2, 85, { align: "center" });

    // Credential data fields (left side, leaving room for QR on right)
    let yPos = 100;
    const fieldAreaWidth = w - 80; // leave 65mm for QR code area on right

    if (displayFields.length > 0) {
      doc.setFontSize(9);
      const colWidth = fieldAreaWidth / 2;
      displayFields.slice(0, 8).forEach(([key, value], i) => {
        const col = i % 2;
        const x = 25 + col * colWidth;
        if (i > 0 && col === 0) yPos += 12;

        doc.setFont("helvetica", "normal");
        doc.setTextColor(148, 163, 184);
        doc.text(formatFieldLabel(key) + ":", x, yPos);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(226, 232, 240);
        doc.text(String(value).substring(0, 35), x, yPos + 5);
      });
    }

    // QR Code area (right side)
    const qrX = w - 55;
    const qrY = 95;
    doc.setDrawColor(55, 65, 81);
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(qrX - 5, qrY - 5, 42, 50, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(99, 102, 241);
    doc.text("SCAN TO VERIFY", qrX + 16, qrY, { align: "center" });

    // Embed QR Code in PDF using the hidden canvas we rendered
    const qrCanvas = document.getElementById("pdf-qr-canvas") as HTMLCanvasElement;
    if (qrCanvas) {
      try {
        const qrDataUrl = qrCanvas.toDataURL("image/png");
        doc.addImage(qrDataUrl, "PNG", qrX + 6, qrY + 4, 30, 30);
      } catch (e) {
        console.error("Failed to generate QR for PDF", e);
        // Fallback text
        doc.setFontSize(5);
        doc.setTextColor(148, 163, 184);
        doc.text(verificationUrl.substring(0, 40), qrX + 16, qrY + 40, { align: "center" });
      }
    } else {
      doc.setFontSize(5);
      doc.setTextColor(148, 163, 184);
      doc.text(verificationUrl.substring(0, 40), qrX + 16, qrY + 40, { align: "center" });
    }


    // Footer
    const footerY = h - 38;
    doc.setDrawColor(55, 65, 81);
    doc.setLineWidth(0.3);
    doc.line(25, footerY, w - 25, footerY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`DID: ${certificate.holderDid}`, 25, footerY + 6);
    doc.text(`Issued: ${issueDate}`, 25, footerY + 11);
    doc.text(`Hash: ${certificate.credentialHash}`, 25, footerY + 16);
    if (certificate.blockchainAnchor) {
      doc.text(`Blockchain Tx: ${certificate.blockchainAnchor}`, 25, footerY + 21);
    }

    // Status badge
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const isActive = certificate.status === "active";
    doc.setTextColor(isActive ? 34 : 239, isActive ? 197 : 68, isActive ? 94 : 68);
    doc.text(`STATUS: ${certificate.status.toUpperCase()}`, w - 25, footerY + 6, { align: "right" });

    // BlockID verification mark
    doc.setFontSize(7);
    doc.setTextColor(99, 102, 241);
    doc.text("Verified by BlockID Platform", w - 25, footerY + 12, { align: "right" });
    doc.text("Polygon Blockchain Anchored", w - 25, footerY + 17, { align: "right" });

    doc.save(`${certificate.credentialName.replace(/\s+/g, "_")}_BlockID_Certificate.pdf`);
  }, [certificate, verificationUrl, issueDate, displayFields]);

  // ─── SVG Download ───────────────────────────────────────────────────
  const downloadSvg = useCallback(() => {
    if (!certificate) return;
    const svgEl = svgContainerRef.current?.querySelector(".cert-svg-root");
    if (!svgEl) return;
    const clone = svgEl.cloneNode(true) as SVGElement;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(clone);
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${certificate.credentialName.replace(/\s+/g, "_")}_BlockID_Certificate.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [certificate]);

  // ─── Print ──────────────────────────────────────────────────────────
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // Early return AFTER all hooks — avoids "Rendered more hooks" error
  if (!certificate) return null;



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" style={{ color: "hsl(var(--issuer))" }} />
            Visual Certificate Preview
          </DialogTitle>
        </DialogHeader>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="issuer" size="sm" className="gap-2" onClick={exportPdf}>
            <Download className="h-4 w-4" /> Export PDF
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={downloadSvg}>
            <FileImage className="h-4 w-4" /> Download SVG
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint}>
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>

        {/* SVG Certificate Rendering */}
        <div ref={svgContainerRef} className="relative rounded-xl overflow-hidden border border-border bg-slate-950">
          <svg
            className="cert-svg-root w-full"
            viewBox="0 0 900 600"
            xmlns="http://www.w3.org/2000/svg"
            style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
          >
            {/* Background */}
            <rect width="900" height="600" fill="#0f172a" />

            {/* Outer Border */}
            <rect x="12" y="12" width="876" height="576" rx="8" ry="8" fill="none" stroke="#6366f1" strokeWidth="2" />

            {/* Inner Border */}
            <rect x="20" y="20" width="860" height="560" rx="6" ry="6" fill="none" stroke="#1e293b" strokeWidth="1" />

            {/* Top accent bar */}
            <rect x="20" y="20" width="860" height="4" rx="2" fill="#6366f1" />

            {/* Corner decorations */}
            <circle cx="35" cy="35" r="3" fill="#6366f1" opacity="0.5" />
            <circle cx="865" cy="35" r="3" fill="#6366f1" opacity="0.5" />
            <circle cx="35" cy="565" r="3" fill="#6366f1" opacity="0.5" />
            <circle cx="865" cy="565" r="3" fill="#6366f1" opacity="0.5" />

            {/* BlockID Header */}
            <text x="450" y="55" textAnchor="middle" fill="#6366f1" fontSize="11" fontWeight="700" letterSpacing="3">
              BLOCKID VERIFIED CREDENTIAL
            </text>

            {/* Main Title */}
            <text x="450" y="88" textAnchor="middle" fill="#f8fafc" fontSize="30" fontWeight="700" letterSpacing="1">
              CERTIFICATE OF CREDENTIAL
            </text>

            {/* Decorative line */}
            <line x1="320" y1="100" x2="580" y2="100" stroke="#6366f1" strokeWidth="1.5" />

            {/* Credential Name */}
            <text x="450" y="130" textAnchor="middle" fill="#a5b4fc" fontSize="22" fontWeight="700">
              {certificate.credentialName.length > 40
                ? certificate.credentialName.substring(0, 40) + "…"
                : certificate.credentialName}
            </text>

            {/* Credential Type */}
            <text x="450" y="150" textAnchor="middle" fill="#94a3b8" fontSize="12" fontWeight="400">
              {certificate.credentialType.toUpperCase()}
            </text>

            {/* "This certifies" */}
            <text x="450" y="185" textAnchor="middle" fill="#64748b" fontSize="13" fontStyle="italic">
              This is to certify that
            </text>

            {/* Holder Name */}
            <text x="450" y="215" textAnchor="middle" fill="#f8fafc" fontSize="26" fontWeight="700">
              {(certificate.holderName || "Credential Holder").substring(0, 45)}
            </text>

            {/* Holder DID (truncated) */}
            <text x="450" y="235" textAnchor="middle" fill="#475569" fontSize="9" fontFamily="monospace">
              {certificate.holderDid.length > 50
                ? certificate.holderDid.substring(0, 50) + "…"
                : certificate.holderDid}
            </text>

            {/* Credential Data Fields */}
            {displayFields.slice(0, 6).map(([key, value], i) => {
              const col = i % 2;
              const row = Math.floor(i / 2);
              const x = col === 0 ? 80 : 380;
              const y = 275 + row * 38;
              return (
                <g key={key}>
                  <text x={x} y={y} fill="#64748b" fontSize="10" fontWeight="400">
                    {formatFieldLabel(key)}
                  </text>
                  <text x={x} y={y + 16} fill="#e2e8f0" fontSize="13" fontWeight="600">
                    {String(value).substring(0, 35)}
                  </text>
                </g>
              );
            })}

            {/* QR Code Area (right side) */}
            <rect x="680" y="265" width="170" height="180" rx="8" fill="#1e293b" stroke="#334155" strokeWidth="1" />
            <text x="765" y="285" textAnchor="middle" fill="#6366f1" fontSize="8" fontWeight="700" letterSpacing="2">
              SCAN TO VERIFY
            </text>

            {/* QR Code as a nested SVG (foreignObject breaks standard image exports) */}
            <svg x="715" y="295" width="100" height="100">
              <QRCodeSVG
                value={verificationUrl}
                size={100}
                bgColor="#1e293b"
                fgColor="#a5b4fc"
                level="M"
                includeMargin={false}
              />
            </svg>

            <text x="765" y="420" textAnchor="middle" fill="#475569" fontSize="7" fontFamily="monospace">
              {verificationUrl.length > 40 ? verificationUrl.substring(0, 40) + "…" : verificationUrl}
            </text>

            {/* Shield verification badge */}
            <circle cx="765" cy="440" r="8" fill="#6366f1" />
            <text x="765" y="444" textAnchor="middle" fill="white" fontSize="10" fontWeight="700">
              ✓
            </text>

            {/* Footer separator */}
            <line x1="50" y1="480" x2="850" y2="480" stroke="#1e293b" strokeWidth="1" />

            {/* Footer left: metadata */}
            <text x="60" y="500" fill="#64748b" fontSize="8">
              Issued: {issueDate}
            </text>
            <text x="60" y="514" fill="#64748b" fontSize="8" fontFamily="monospace">
              Hash: {certificate.credentialHash.substring(0, 50)}…
            </text>
            {certificate.blockchainAnchor && (
              <text x="60" y="528" fill="#64748b" fontSize="8" fontFamily="monospace">
                Blockchain Tx: {certificate.blockchainAnchor.substring(0, 50)}…
              </text>
            )}

            {/* Footer right: status & branding */}
            <text x="840" y="500" textAnchor="end" fill={certificate.status === "active" ? "#22c55e" : "#ef4444"} fontSize="9" fontWeight="700">
              STATUS: {certificate.status.toUpperCase()}
            </text>
            <text x="840" y="514" textAnchor="end" fill="#6366f1" fontSize="8">
              Verified by BlockID Platform
            </text>
            <text x="840" y="528" textAnchor="end" fill="#475569" fontSize="8">
              Polygon Blockchain Anchored
            </text>

            {/* Issuer label */}
            <text x="450" y="565" textAnchor="middle" fill="#334155" fontSize="8">
              Issued by: {issuerLabel} · BlockID Self-Sovereign Identity Ecosystem
            </text>
          </svg>
        </div>

        {/* Hidden canvas for PDF Export to accurately capture the QR code */}
        <div style={{ display: "none" }}>
          <QRCodeCanvas
            id="pdf-qr-canvas"
            value={verificationUrl}
            size={200}
            bgColor="#1e293b"
            fgColor="#a5b4fc"
            level="M"
            includeMargin={false}
          />
        </div>


        {/* Verification Link */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          <span>Anti-counterfeit QR links to:</span>
          <code className="text-[11px] font-mono text-foreground truncate">{verificationUrl}</code>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CertificateRenderer;
