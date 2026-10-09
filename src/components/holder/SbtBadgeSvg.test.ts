import { describe, it, expect } from "vitest";
import { canonicalBadgeLabel, layoutLabel, buildBadgeSvgDataUri } from "./SbtBadgeSvg";

const decodeDataUri = (uri: string): string =>
  Buffer.from(uri.replace(/^data:image\/svg\+xml;base64,/, ""), "base64").toString("utf-8");

describe("canonicalBadgeLabel", () => {
  it("maps a long degree schema onto DEGREE", () => {
    expect(canonicalBadgeLabel("B.TECH IN COMPUTER SCIENCE", "education")).toBe("Degree");
  });

  it("prefers the schema name over the credential type", () => {
    expect(canonicalBadgeLabel("Transcript of Records", "education")).toBe("Transcript");
  });

  it("falls back to the credential type when the schema name has no match", () => {
    expect(canonicalBadgeLabel("Q3 2026 Award", "employment")).toBe("Employment");
  });

  it("handles identity, diploma, certificate, membership and health", () => {
    expect(canonicalBadgeLabel("national id card", null)).toBe("Digital Identity Card");
    expect(canonicalBadgeLabel("Diploma of Engineering", null)).toBe("Diploma");
    expect(canonicalBadgeLabel(null, "certification")).toBe("Certificate");
    expect(canonicalBadgeLabel("club membership 2026", null)).toBe("Membership");
    expect(canonicalBadgeLabel("vaccination record", "health")).toBe("Health Card");
  });

  it("keeps an unmatched schema name untouched", () => {
    expect(canonicalBadgeLabel("Loyalty Points", null)).toBe("Loyalty Points");
  });

  it("uses the fallback when nothing is known", () => {
    expect(canonicalBadgeLabel(null, null, "Credential")).toBe("Credential");
  });
});

describe("layoutLabel", () => {
  it("never truncates mid-word", () => {
    const layout = layoutLabel("DEGREE");
    expect(layout.lines).toEqual(["DEGREE"]);
    expect(layout.lines.join(" ")).not.toContain("…");
  });

  it("wraps a long label onto up to three lines", () => {
    const layout = layoutLabel("DIGITAL IDENTITY CARD");
    expect(layout.lines.length).toBeGreaterThan(1);
    expect(layout.lines.length).toBeLessThanOrEqual(3);
    expect(layout.lines.join(" ")).toBe("DIGITAL IDENTITY CARD");
  });

  it("shrinks the font as the label gets longer", () => {
    expect(layoutLabel("DEGREE").fontSize).toBe(8);
    expect(layoutLabel("B.TECH IN COMPUTER SCIENCE AND ENGINEERING").fontSize).toBeLessThan(8);
  });

  it("caps pathological input at three lines", () => {
    const layout = layoutLabel(Array.from({ length: 40 }, (_, i) => `word${i}`).join(" "));
    expect(layout.lines.length).toBeLessThanOrEqual(3);
    expect(layout.lines[2]).toContain("…");
  });

  it("handles empty input", () => {
    expect(layoutLabel("   ").lines).toEqual([]);
  });
});

describe("buildBadgeSvgDataUri", () => {
  it("emits the same canonical, wrapped label as the component", () => {
    const svg = decodeDataUri(buildBadgeSvgDataUri("education", "B.TECH IN COMPUTER SCIENCE", 7));
    expect(svg).toContain(">DEGREE<");
    expect(svg).not.toContain("…");
    expect(svg).toContain("#7");
  });

  it("escapes XML-sensitive characters in schema names", () => {
    const svg = decodeDataUri(buildBadgeSvgDataUri(null, "R&D <Badges>", 1));
    expect(svg).toContain("R&amp;D &lt;BADGES&gt;");
    expect(svg).not.toContain("<Badges>");
  });

  it("returns a base64 SVG data URI", () => {
    expect(buildBadgeSvgDataUri("identity", "KYC", 3)).toMatch(
      /^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/
    );
  });
});
