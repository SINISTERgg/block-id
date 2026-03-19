import jsPDF from "jspdf";

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
}

export function generateCertificatePdf(cert: CertificateData) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  // Background
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, w, h, "F");

  // Border
  doc.setDrawColor(45, 149, 140);
  doc.setLineWidth(1.5);
  doc.roundedRect(10, 10, w - 20, h - 20, 4, 4, "S");
  doc.setDrawColor(45, 149, 140);
  doc.setLineWidth(0.5);
  doc.roundedRect(14, 14, w - 28, h - 28, 3, 3, "S");

  // Header accent line
  doc.setFillColor(45, 149, 140);
  doc.rect(14, 14, w - 28, 2, "F");

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(30, 41, 59);
  doc.text("CERTIFICATE OF CREDENTIAL", w / 2, 38, { align: "center" });

  // Decorative line
  doc.setDrawColor(45, 149, 140);
  doc.setLineWidth(0.8);
  doc.line(w / 2 - 50, 43, w / 2 + 50, 43);

  // Credential name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(45, 149, 140);
  doc.text(cert.credentialName, w / 2, 55, { align: "center" });

  // Type
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text(cert.credentialType, w / 2, 62, { align: "center" });

  // "This certifies that"
  doc.setFontSize(12);
  doc.setTextColor(100, 116, 139);
  doc.text("This certifies that", w / 2, 75, { align: "center" });

  // Holder name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59);
  doc.text(cert.holderName || "Credential Holder", w / 2, 85, { align: "center" });

  // Credential data fields
  const entries = Object.entries(cert.credentialData).filter(
    ([k]) => !["@context", "type", "id", "issuer", "issuanceDate", "credentialSubject"].includes(k)
  );

  // Flatten credentialSubject if present
  const subject = cert.credentialData.credentialSubject;
  if (subject && typeof subject === "object") {
    Object.entries(subject).forEach(([k, v]) => {
      if (k !== "id") entries.push([k, v]);
    });
  }

  let yPos = 98;
  const colWidth = (w - 60) / 2;

  if (entries.length > 0) {
    doc.setFontSize(10);
    entries.slice(0, 8).forEach(([key, value], i) => {
      const col = i % 2;
      const x = 35 + col * colWidth;
      if (i > 0 && col === 0) yPos += 10;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) + ":", x, yPos);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 41, 59);
      doc.text(String(value ?? "—").substring(0, 40), x + 2, yPos + 5);
    });
    yPos += 16;
  }

  // Footer section
  const footerY = Math.max(yPos + 5, h - 55);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(30, footerY, w - 30, footerY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);

  doc.text(`DID: ${cert.holderDid}`, 30, footerY + 8);
  doc.text(`Issued: ${new Date(cert.issuedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, 30, footerY + 13);
  doc.text(`Hash: ${cert.credentialHash}`, 30, footerY + 18);
  if (cert.blockchainAnchor) {
    doc.text(`Blockchain Anchor: ${cert.blockchainAnchor}`, 30, footerY + 23);
  }

  doc.text(`Status: ${cert.status.toUpperCase()}`, w - 30, footerY + 8, { align: "right" });
  doc.setFontSize(7);
  doc.text("Verified by DecentraID Platform", w - 30, footerY + 13, { align: "right" });

  // Shield icon placeholder
  doc.setFillColor(45, 149, 140);
  doc.circle(w - 30, footerY + 22, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255);
  doc.text("✓", w - 30, footerY + 23.5, { align: "center" });

  doc.save(`${cert.credentialName.replace(/\s+/g, "_")}_Certificate.pdf`);
}
