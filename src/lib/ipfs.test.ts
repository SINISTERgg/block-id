import { describe, it, expect } from "vitest";
import {
  DEFAULT_IPFS_GATEWAY,
  IPFS_GATEWAYS,
  buildSchemaJsonLd,
  extractCid,
  getGatewayCandidates,
  isValidCid,
  toGatewayUrl,
  toIpfsUri,
} from "./ipfs";

const CID_V0 = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
// Valid CIDv1 (base32) — 'b' prefix + 59 lowercase base32 chars
const CID_V1 = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

describe("extractCid", () => {
  it("returns plain CIDs unchanged", () => {
    expect(extractCid(CID_V0)).toBe(CID_V0);
    expect(extractCid(CID_V1)).toBe(CID_V1);
  });

  it("parses ipfs:// URIs", () => {
    expect(extractCid(`ipfs://${CID_V0}`)).toBe(CID_V0);
    expect(extractCid(`IPFS://${CID_V1}`)).toBe(CID_V1);
  });

  it("parses unix-style /ipfs/ paths", () => {
    expect(extractCid(`/ipfs/${CID_V0}`)).toBe(CID_V0);
    expect(extractCid(`ipfs:///ipfs/${CID_V0}`)).toBe(CID_V0);
  });

  it("parses gateway https URLs", () => {
    expect(extractCid(`https://ipfs.io/ipfs/${CID_V0}`)).toBe(CID_V0);
    expect(extractCid(`https://dweb.link/ipfs/${CID_V0}?download=true`)).toBe(CID_V0);
  });

  it("trims surrounding whitespace", () => {
    expect(extractCid(`  ${CID_V0}  `)).toBe(CID_V0);
  });

  it("returns null for empty or missing input", () => {
    expect(extractCid(null)).toBeNull();
    expect(extractCid(undefined)).toBeNull();
    expect(extractCid("")).toBeNull();
    expect(extractCid("   ")).toBeNull();
  });

  it("returns null for non-IPFS URLs and paths", () => {
    expect(extractCid("https://example.com/foo/bar")).toBeNull();
    expect(extractCid(`${CID_V0}/child`)).toBeNull();
    expect(extractCid("http://evil.com")).toBeNull();
  });
});

describe("isValidCid", () => {
  it("accepts CIDv0", () => {
    expect(isValidCid(CID_V0)).toBe(true);
  });

  it("accepts CIDv1 base32", () => {
    expect(isValidCid(CID_V1)).toBe(true);
  });

  it("rejects malformed strings", () => {
    expect(isValidCid("")).toBe(false);
    expect(isValidCid("not-a-cid")).toBe(false);
    expect(isValidCid("QmShort")).toBe(false);
    // uppercase is not valid base32 for CIDv1
    expect(isValidCid("BAFYBEIGDYRZT5SFP7UDM7HU76UH7Y26NF3EFUYLQABF3OCLGTQY55FBZDI")).toBe(false);
    // contains invalid base58 char (0)
    expect(isValidCid("Qm000000000000000000000000000000000000000000000")).toBe(false);
  });

  it("rejects ipfs:// wrapped URIs (expects bare CID)", () => {
    expect(isValidCid(`ipfs://${CID_V0}`)).toBe(false);
  });
});

describe("toIpfsUri", () => {
  it("canonicalizes every accepted input form", () => {
    expect(toIpfsUri(CID_V0)).toBe(`ipfs://${CID_V0}`);
    expect(toIpfsUri(`ipfs://${CID_V0}`)).toBe(`ipfs://${CID_V0}`);
    expect(toIpfsUri(`https://ipfs.io/ipfs/${CID_V0}`)).toBe(`ipfs://${CID_V0}`);
  });

  it("throws on invalid input", () => {
    expect(() => toIpfsUri("garbage/path")).toThrow("Invalid IPFS URI or CID");
  });
});

describe("toGatewayUrl", () => {
  it("uses the default gateway when none provided", () => {
    expect(toGatewayUrl(CID_V0)).toBe(`${DEFAULT_IPFS_GATEWAY}${CID_V0}`);
  });

  it("honors a custom gateway and adds trailing slash", () => {
    expect(toGatewayUrl(CID_V0, "https://gateway.example/ipfs")).toBe(
      `https://gateway.example/ipfs/${CID_V0}`
    );
  });

  it("accepts full ipfs:// URIs as input", () => {
    expect(toGatewayUrl(`ipfs://${CID_V1}`, "https://dweb.link/ipfs/")).toBe(
      `https://dweb.link/ipfs/${CID_V1}`
    );
  });

  it("throws on structurally invalid input", () => {
    expect(() => toGatewayUrl("garbage/path")).toThrow("Invalid IPFS URI or CID");
    expect(() => toGatewayUrl("https://example.com/notipfs/x")).toThrow("Invalid IPFS URI or CID");
  });
});

describe("getGatewayCandidates", () => {
  it("returns one URL per configured public gateway in order", () => {
    const candidates = getGatewayCandidates(CID_V0);
    expect(candidates).toHaveLength(IPFS_GATEWAYS.length);
    candidates.forEach((url, i) => expect(url).toBe(`${IPFS_GATEWAYS[i]}${CID_V0}`));
  });
});

describe("buildSchemaJsonLd", () => {
  const schema = {
    id: "11111111-2222-3333-4444-555555555555",
    name: "Bachelor of Science",
    credential_type: "diploma",
    fields: [
      { name: "student_name", type: "string", required: true },
      { name: "gpa", type: "number", required: false },
    ],
    version: 2,
    issuer_id: "issuer-user-id",
    created_at: "2026-01-01T00:00:00.000Z",
  };

  it("includes W3C @context and schema validator type", () => {
    const doc = buildSchemaJsonLd(schema);
    expect(doc["@context"]).toContain("https://www.w3.org/2018/credentials/v1");
    expect(doc.type).toBe("JsonSchemaValidator2018");
  });

  it("maps core schema metadata", () => {
    const doc = buildSchemaJsonLd(schema) as Record<string, any>;
    expect(doc.schemaId).toBe(schema.id);
    expect(doc.name).toBe("Bachelor of Science");
    expect(doc.credentialType).toBe("diploma");
    expect(doc.version).toBe(2);
    expect(doc.fields).toEqual(schema.fields);
    expect(doc.created).toBe("2026-01-01T00:00:00.000Z");
  });

  it("builds issuer DID from issuer_id", () => {
    const doc = buildSchemaJsonLd(schema) as Record<string, any>;
    expect(doc.issuer).toBe("did:decentraid:issuer:issuer-user-id");
  });

  it("omits issuer field when issuer_id absent", () => {
    const doc = buildSchemaJsonLd({ ...schema, issuer_id: undefined }) as Record<string, any>;
    expect(doc.issuer).toBeUndefined();
  });

  it("defaults version to 1 and created to a timestamp string", () => {
    const doc = buildSchemaJsonLd({ name: "X", credential_type: "certificate", fields: [] }) as Record<string, any>;
    expect(doc.version).toBe(1);
    expect(typeof doc.created).toBe("string");
    expect(new Date(doc.created as string).getTime()).not.toBeNaN();
  });

  it("coerces non-array fields to an empty array", () => {
    const doc = buildSchemaJsonLd({ name: "X", credential_type: "certificate", fields: null }) as Record<string, any>;
    expect(doc.fields).toEqual([]);
  });
});
