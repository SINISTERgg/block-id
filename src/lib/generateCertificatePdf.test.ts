import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDoc = {
  setFillColor: vi.fn(),
  rect: vi.fn(),
  setDrawColor: vi.fn(),
  setLineWidth: vi.fn(),
  roundedRect: vi.fn(),
  setFont: vi.fn(),
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  text: vi.fn(),
  line: vi.fn(),
  circle: vi.fn(),
  save: vi.fn(),
  splitTextToSize: vi.fn(() => ["line1", "line2"]),
  internal: {
    pageSize: {
      getWidth: () => 297,
      getHeight: () => 210,
    },
  },
  addImage: vi.fn(),
  getOutput: vi.fn(() => new Uint8Array()),
};

vi.mock("jspdf", () => ({
  default: vi.fn(() => mockDoc),
}));

import { generateCertificatePdf } from "./generateCertificatePdf";

describe("generateCertificatePdf", () => {
  const validCert = {
    credentialName: "Bachelor of Science",
    credentialType: "Diploma",
    holderName: "John Doe",
    holderDid: "did:decentraid:holder:abc123",
    issuedAt: "2026-01-15T00:00:00Z",
    status: "active",
    credentialHash: "a".repeat(64),
    blockchainAnchor: "0x" + "b".repeat(64),
    credentialData: { university: "MIT", gpa: "3.8" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a PDF and saves it", () => {
    generateCertificatePdf(validCert);
    expect(mockDoc.save).toHaveBeenCalledWith("Bachelor_of_Science_Certificate.pdf");
    expect(mockDoc.setFillColor).toHaveBeenCalled();
    expect(mockDoc.text).toHaveBeenCalled();
  });

  it("draws background and borders", () => {
    generateCertificatePdf(validCert);
    expect(mockDoc.setFillColor).toHaveBeenCalledWith(248, 250, 252);
    expect(mockDoc.rect).toHaveBeenCalled();
    expect(mockDoc.roundedRect).toHaveBeenCalled();
  });

  it("draws decorative line", () => {
    generateCertificatePdf(validCert);
    expect(mockDoc.line).toHaveBeenCalled();
  });

  it("renders the credential name as title", () => {
    generateCertificatePdf(validCert);
    expect(mockDoc.text).toHaveBeenCalledWith(
      "Bachelor of Science",
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: "center" })
    );
  });

  it("renders the holder name", () => {
    generateCertificatePdf(validCert);
    expect(mockDoc.text).toHaveBeenCalledWith(
      "John Doe",
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: "center" })
    );
  });

  it("renders the credential type", () => {
    generateCertificatePdf(validCert);
    expect(mockDoc.text).toHaveBeenCalledWith(
      "Diploma",
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: "center" })
    );
  });

  it("renders issuer DID in footer", () => {
    generateCertificatePdf(validCert);
    expect(mockDoc.text).toHaveBeenCalledWith(
      expect.stringContaining("did:decentraid"),
      expect.any(Number),
      expect.any(Number)
    );
  });

  it("renders credential hash in footer", () => {
    generateCertificatePdf(validCert);
    expect(mockDoc.text).toHaveBeenCalledWith(
      expect.stringContaining("Hash:"),
      expect.any(Number),
      expect.any(Number)
    );
  });

  it("renders blockchain anchor when present", () => {
    generateCertificatePdf(validCert);
    expect(mockDoc.text).toHaveBeenCalledWith(
      expect.stringContaining("Blockchain Anchor:"),
      expect.any(Number),
      expect.any(Number)
    );
  });

  it("skips blockchain anchor when null", () => {
    const noAnchor = { ...validCert, blockchainAnchor: null };
    generateCertificatePdf(noAnchor);
    const calls = mockDoc.text.mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.every((c) => !c.includes("Blockchain Anchor:"))).toBe(true);
  });

  it("draws shield icon circle", () => {
    generateCertificatePdf(validCert);
    expect(mockDoc.circle).toHaveBeenCalled();
  });

  it("saves the PDF file", () => {
    generateCertificatePdf(validCert);
    expect(mockDoc.save).toHaveBeenCalledWith("Bachelor_of_Science_Certificate.pdf");
  });
});
