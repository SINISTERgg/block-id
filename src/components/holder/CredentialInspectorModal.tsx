import { useMemo, useState } from "react";
import {
  Copy, Check, ExternalLink, Loader2, ShieldCheck, ShieldX, Link2,
  FileJson, Fingerprint, Blocks, AlertTriangle,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useVerifyOnChain } from "@/hooks/useVerifyOnChain";
import { canonicalJson } from "@/lib/crypto";
import { supabase } from "@/integrations/supabase/client";
import { AMOY_EXPLORER } from "@/services/blockchain/config";
import type { HolderCredential } from "@/services/api/holder.service";

interface CredentialInspectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credential: HolderCredential | null;
  onCopy: (text: string) => void;
}

/** Top-level keys that describe the envelope rather than the holder's claims. */
const META_KEYS = new Set([
  "@context", "type", "id", "issuer", "issuanceDate", "expirationDate",
  "proof", "credentialHash", "blockchain", "previousHash", "credentialSchema",
  "credentialStatus", "refreshService", "termsOfUse", "evidence", "credentialSubject",
]);

type ClaimValue = string | number | boolean | null;

interface ClaimRow {
  key: string;
  value: ClaimValue;
  /** Dotted path used for the nested `credentialSubject.*` rows. */
  path: string;
  isObject: boolean;
}

function formatLabel(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function renderValue(value: unknown): ClaimValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ");
  return null;
}

/** Recursively flatten `credentialSubject` + top-level fields into displayable rows. */
function extractClaims(data: Record<string, any>): ClaimRow[] {
  const rows: ClaimRow[] = [];

  const walk = (obj: Record<string, any>, prefix: string) => {
    Object.entries(obj).forEach(([key, value]) => {
      if (prefix === "" && key === "id") return;
      const path = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        rows.push({ key: formatLabel(key), value: null, path, isObject: true });
        walk(value, path);
        return;
      }
      rows.push({ key: formatLabel(key), value: renderValue(value), path, isObject: false });
    });
  };

  const subject = data.credentialSubject;
  if (subject && typeof subject === "object") walk(subject, "credentialSubject");

  Object.entries(data).forEach(([key, value]) => {
    if (META_KEYS.has(key)) return;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) return;
    rows.push({ key: formatLabel(key), value: renderValue(value), path: key, isObject: false });
  });

  return rows;
}

/** Map the stored proof type onto the algorithm families a reader cares about. */
function describeProofType(type?: string): string {
  if (!type) return "Unknown";
  if (type === "Ed25519Signature2020") return "Ed25519Signature2020";
  if (type === "EcdsaSecp256k1Signature2019") return "EIP-712 (personal_sign) — ECDSA secp256k1";
  return type;
}

function describeNetwork(data: Record<string, any>): string {
  const chainId = data.blockchain?.chainId;
  if (chainId !== undefined && chainId !== null) {
    const id = Number(chainId);
    if (id === 1) return "Ethereum Mainnet";
    if (id === 11155111) return "Ethereum Sepolia";
    if (id === 137) return "Polygon Mainnet";
    if (id === 80002) return "Polygon Amoy";
    return `Chain ${id}`;
  }
  const network = data.blockchain?.network;
  if (network === "polygon") return "Polygon";
  if (network === "sepolia") return "Ethereum Sepolia";
  return network ?? "Unspecified";
}

function explorerBaseFor(data: Record<string, any>): string {
  const chainId = data.blockchain?.chainId;
  const id = chainId !== undefined && chainId !== null ? Number(chainId) : null;
  if (id === 1) return "https://etherscan.io";
  if (id === 137) return "https://polygonscan.com";
  if (id === 80002) return "https://amoy.polygonscan.com";
  if (data.blockchain?.network === "polygon") return "https://polygonscan.com";
  return AMOY_EXPLORER;
}

const CredentialInspectorModal = ({ open, onOpenChange, credential, onCopy }: CredentialInspectorModalProps) => {
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [serverVerify, setServerVerify] = useState<{ state: "idle" | "loading" | "ok" | "fail"; message: string }>({
    state: "idle",
    message: "",
  });

  const data = useMemo<Record<string, any>>(
    () => (credential?.credential_data as Record<string, any>) ?? {},
    [credential],
  );

  const onChain = useVerifyOnChain(open ? credential?.credential_hash : null);

  const claims = useMemo(() => extractClaims(data), [data]);
  const canonical = useMemo(() => canonicalJson(data), [data]);

  if (!credential) return null;

  const proof = data.proof ?? {};
  const txHash = data.blockchain?.txHash as string | undefined;
  const explorerBase = explorerBaseFor(data);
  const expiresAt = credential.expires_at ?? data.expirationDate ?? null;
  const schemaId = data.credentialSchema?.id ?? credential.id;

  const copyField = (path: string, value: string) => {
    onCopy(value);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath((c) => (c === path ? null : c)), 1500);
  };

  const runServerVerify = async () => {
    setServerVerify({ state: "loading", message: "" });
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-credential`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.session?.access_token}`,
        },
        body: JSON.stringify({ credential_id: credential.id }),
      });
      const result = await res.json();
      if (result.blockchain_verified) {
        setServerVerify({
          state: "ok",
          message: `Hash matches on-chain anchor${result.on_chain_verification?.blockNumber ? ` at block #${result.on_chain_verification.blockNumber}` : ""}.`,
        });
      } else {
        setServerVerify({ state: "fail", message: result.error || "Credential hash does not match its on-chain anchor." });
      }
    } catch {
      setServerVerify({ state: "fail", message: "Network error while verifying." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl flex flex-col max-h-[90vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="font-display text-xl">Credential Inspector</DialogTitle>
          <DialogDescription>
            {credential.credential_schemas?.name || "Credential"} — full metadata, claims, cryptographic proof and on-chain state.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="metadata" className="flex flex-col min-h-0">
          <TabsList className="shrink-0">
            <TabsTrigger value="metadata">Metadata</TabsTrigger>
            <TabsTrigger value="claims">Claims</TabsTrigger>
            <TabsTrigger value="proof">Proof</TabsTrigger>
            <TabsTrigger value="chain">Blockchain</TabsTrigger>
          </TabsList>

          {/* ── Metadata ─────────────────────────────────────────────── */}
          <TabsContent value="metadata" className="mt-4 overflow-y-auto pr-1">
            <dl className="divide-y divide-border border border-border">
              {[
                { label: "Schema name", value: credential.credential_schemas?.name || "—" },
                { label: "Schema ID", value: schemaId, mono: true },
                { label: "Schema version", value: data.credentialSchema?.version ?? "—" },
                { label: "Credential type", value: data.type?.[1] ?? credential.credential_schemas?.credential_type ?? "—" },
                { label: "Issuer DID", value: data.issuer ?? "—", mono: true },
                { label: "Holder DID", value: data.credentialSubject?.id ?? "—", mono: true },
                { label: "Issued at", value: new Date(credential.issued_at).toLocaleString() },
                { label: "Expires at", value: expiresAt ? new Date(expiresAt).toLocaleString() : "Never" },
                { label: "Status", value: credential.status },
              ].map((row) => (
                <div key={row.label} className="flex items-start gap-4 px-4 py-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground w-36 shrink-0 pt-0.5">
                    {row.label}
                  </dt>
                  <dd className={`flex-1 min-w-0 text-sm text-foreground break-all ${row.mono ? "font-mono text-xs" : ""}`}>
                    {row.value}
                  </dd>
                  <button
                    onClick={() => copyField(row.label, String(row.value))}
                    className="p-1 hover:bg-muted transition-colors shrink-0"
                    aria-label={`Copy ${row.label}`}
                  >
                    {copiedPath === row.label
                      ? <Check className="h-3.5 w-3.5 text-success" />
                      : <Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />}
                  </button>
                </div>
              ))}
            </dl>
          </TabsContent>

          {/* ── Claims ───────────────────────────────────────────────── */}
          <TabsContent value="claims" className="mt-4 overflow-y-auto pr-1">
            {claims.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">This credential carries no claims.</p>
            ) : (
              <div className="border border-border divide-y divide-border">
                {claims.map((claim) => (
                  <div key={claim.path} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${claim.isObject ? "text-muted-foreground font-mono text-[11px] uppercase tracking-wider" : "text-foreground"}`}>
                        {claim.isObject && "▸ "}{claim.key}
                      </p>
                      {!claim.isObject && (
                        <p className="font-mono text-xs text-muted-foreground break-all mt-0.5">
                          {claim.value === null ? "—" : String(claim.value)}
                        </p>
                      )}
                    </div>
                    {!claim.isObject && (
                      <button
                        onClick={() => copyField(claim.path, String(claim.value ?? ""))}
                        className="p-1.5 hover:bg-muted transition-colors shrink-0"
                        aria-label={`Copy ${claim.key}`}
                      >
                        {copiedPath === claim.path
                          ? <Check className="h-3.5 w-3.5 text-success" />
                          : <Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Cryptographic proof ─────────────────────────────────── */}
          <TabsContent value="proof" className="mt-4 space-y-4 overflow-y-auto pr-1">
            <div className="border border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Fingerprint className="h-4 w-4 text-holder" />
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Canonical JSON-LD Hash (SHA-256)
                </span>
              </div>
              <p className="font-mono text-xs text-foreground break-all bg-muted px-3 py-2">
                {credential.credential_hash || "—"}
              </p>
              <button
                onClick={() => copyField("hash", credential.credential_hash || "")}
                className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-holder hover:underline"
              >
                {copiedPath === "hash" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Copy hash
              </button>
            </div>

            <div className="border border-border divide-y divide-border">
              {[
                { label: "Signature algorithm", value: describeProofType(proof.type), icon: ShieldCheck },
                { label: "Proof purpose", value: proof.proofPurpose ?? "—" },
                { label: "Signer public key", value: proof.verificationMethod ?? "—", mono: true },
                { label: "Signer address", value: proof.signedBy ?? "—", mono: true },
                { label: "Signature type", value: proof.signatureType ?? "—" },
                { label: "Proof created", value: proof.created ? new Date(proof.created).toLocaleString() : "—" },
                { label: "Proof value", value: proof.proofValue ?? "—", mono: true },
              ].map((row) => (
                <div key={row.label} className="flex items-start gap-4 px-4 py-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground w-40 shrink-0 pt-0.5">
                    {row.label}
                  </dt>
                  <dd className={`flex-1 min-w-0 text-sm text-foreground break-all ${row.mono ? "font-mono text-xs" : ""}`}>
                    {row.value}
                  </dd>
                  <button
                    onClick={() => copyField(row.label, String(row.value))}
                    className="p-1 hover:bg-muted transition-colors shrink-0"
                    aria-label={`Copy ${row.label}`}
                  >
                    {copiedPath === row.label
                      ? <Check className="h-3.5 w-3.5 text-success" />
                      : <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />}
                  </button>
                </div>
              ))}
            </div>

            <div className="border border-border">
              <div className="flex items-center gap-2 border-b border-border px-4 py-2">
                <FileJson className="h-4 w-4 text-holder" />
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Canonical payload
                </span>
                <button
                  onClick={() => copyField("canonical", canonical)}
                  className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-holder hover:underline"
                >
                  {copiedPath === "canonical" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Copy
                </button>
              </div>
              <pre className="max-h-48 overflow-auto p-4 font-mono text-[10px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-all">
                {JSON.stringify(JSON.parse(canonical), null, 2)}
              </pre>
            </div>
          </TabsContent>

          {/* ── Blockchain verification ──────────────────────────────── */}
          <TabsContent value="chain" className="mt-4 space-y-4 overflow-y-auto pr-1">
            {!credential.blockchain_anchor || !txHash ? (
              <div className="flex items-start gap-3 border-l-2 border-warning bg-warning/10 p-4">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
                <p className="text-sm text-muted-foreground">
                  This credential has not been anchored on-chain. There is no transaction to verify against
                  <code className="font-mono text-xs"> CredentialRegistry.sol</code>.
                </p>
              </div>
            ) : (
              <>
                <div className="border border-border divide-y divide-border">
                  <div className="flex items-start gap-4 px-4 py-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground w-36 shrink-0 pt-0.5">Network</span>
                    <span className="flex-1 text-sm text-foreground">
                      <span className="inline-flex items-center gap-1.5 border border-holder/40 bg-holder/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-holder">
                        <Blocks className="h-3 w-3" /> {describeNetwork(data)}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-start gap-4 px-4 py-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground w-36 shrink-0 pt-0.5">Anchor tx</span>
                    <a
                      href={`${explorerBase}/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 font-mono text-xs text-holder hover:underline break-all inline-flex items-center gap-1.5"
                    >
                      <Link2 className="h-3.5 w-3.5 shrink-0" /> {txHash} <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </div>
                  <div className="flex items-start gap-4 px-4 py-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground w-36 shrink-0 pt-0.5">Block number</span>
                    <span className="flex-1 font-mono text-xs text-foreground">
                      {onChain.anchorBlock || data.blockchain?.blockNumber || "—"}
                    </span>
                  </div>
                </div>

                <div className="border border-border p-4 space-y-3">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Live verification against CredentialRegistry.sol
                  </span>
                  <div className="flex items-center gap-3">
                    {onChain.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : onChain.isRevoked ? (
                      <ShieldX className="h-4 w-4 text-destructive" />
                    ) : onChain.isAnchored ? (
                      <ShieldCheck className="h-4 w-4 text-success" />
                    ) : (
                      <ShieldX className="h-4 w-4 text-muted-foreground" />
                    )}
                    <p className="text-sm text-foreground">
                      {onChain.loading
                        ? "Querying RPC…"
                        : onChain.error
                          ? `Registry read failed: ${onChain.error}`
                          : onChain.isRevoked
                            ? "Credential is revoked on-chain."
                            : onChain.isAnchored
                              ? `Anchored on-chain${onChain.anchorBlock ? ` at block #${onChain.anchorBlock}` : ""}. Not revoked.`
                              : "No registry entry found for this hash."}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="w-full gap-2" onClick={runServerVerify} disabled={serverVerify.state === "loading"}>
                    {serverVerify.state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    {serverVerify.state === "loading" ? "Verifying…" : "Run full verification"}
                  </Button>
                  {serverVerify.message && (
                    <p className={`text-xs ${serverVerify.state === "ok" ? "text-success" : serverVerify.state === "fail" ? "text-destructive" : "text-muted-foreground"}`}>
                      {serverVerify.message}
                    </p>
                  )}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default CredentialInspectorModal;
