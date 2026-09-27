/**
 * SchemaValidationPanel — catch a malformed presentation before the edge
 * function does.
 *
 * The verify edge function will happily accept arbitrary JSON and then fail
 * deep inside credential parsing, which surfaces to the user as an opaque
 * error. This panel validates the *envelope* locally — W3C VC Data Model
 * shape, DID syntax, JWS structure, and the OID4VP-specific variants — and
 * offers a "normalize" action for the two mistakes that are unambiguous:
 * a bare VC that should be wrapped in a VP, and a base64url `jwt_vc` that
 * should be decoded first.
 *
 * It reports problems; it does not decide whether a credential is *valid*.
 * Signature and revocation checks are the edge function's job.
 */
import { useMemo, useState } from "react";
import {
  FileCheck2, AlertTriangle, CheckCircle2, XCircle, Wand2, ChevronDown, Info,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Severity = "error" | "warn" | "info";

interface Issue {
  severity: Severity;
  code: string;
  message: string;
  /** A safe one-click fix, when one exists. */
  fix?: { label: string; apply: (parsed: Record<string, unknown>) => Record<string, unknown> };
}

const SEVERITY_META: Record<Severity, { icon: typeof Info; cls: string; word: string }> = {
  error: { icon: XCircle, cls: "text-destructive", word: "error" },
  warn: { icon: AlertTriangle, cls: "text-amber-500", word: "warning" },
  info: { icon: Info, cls: "text-muted-foreground", word: "note" },
};

/** did:key / did:ethr / did:web / did:pkh — enough for a verifier's inputs. */
const DID_RE = /^did:(key|ethr|web|pkh|sov|veramo:[a-z]+):[A-Za-z0-9._:%-]+[A-Za-z0-9._-]$/;

/** Decode a base64url JWT payload without verifying anything. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function looksLikeJwtVc(v: unknown): v is { jwt_vc: string } {
  return !!v && typeof v === "object" && typeof (v as { jwt_vc?: unknown }).jwt_vc === "string";
}

/** Run every envelope check and collect the issues. */
function validate(parsed: Record<string, unknown>): Issue[] {
  const issues: Issue[] = [];

  if (Array.isArray(parsed.verifiableCredential)) {
    issues.push({
      severity: "info",
      code: "multi-vc",
      message:
        "This presentation carries multiple credentials. Every one must pass verification — the report will show the aggregate result.",
    });
  }

  const vcRaw = Array.isArray(parsed.verifiableCredential)
    ? parsed.verifiableCredential[0]
    : parsed.verifiableCredential;

  if (vcRaw === undefined) {
    issues.push({
      severity: "error",
      code: "missing-vc",
      message:
        "No `verifiableCredential` field. This does not look like a verifiable presentation.",
    });
    return issues;
  }

  // Resolve what the credential-level checks below should run against. A
  // `{ jwt_vc }` wrapper is only a transport envelope — the claims live inside
  // the JWS payload, so validating the wrapper itself would report every field
  // as missing.
  let target: Record<string, unknown> | null = null;
  if (typeof vcRaw === "string") {
    target = decodeJwtPayload(vcRaw);
  } else if (looksLikeJwtVc(vcRaw)) {
    const payload = decodeJwtPayload(vcRaw.jwt_vc);
    issues.push({
      severity: payload ? "info" : "error",
      code: "jwt-vc",
      message: payload
        ? "Credential is a `jwt_vc`. BlockID will verify the JWS signature; the decoded claims are checked below."
        : "`jwt_vc` is not a well-formed JWS (expected three dot-separated segments).",
    });
    if (!payload) return issues;
    target = payload;
  } else {
    target = vcRaw as Record<string, unknown>;
  }

  if (target) {
    const context = target["@context"];
    if (!context) {
      issues.push({
        severity: "error",
        code: "missing-context",
        message: "Missing `@context`. A W3C VC must declare at least the base context.",
      });
    } else if (
      !Array.isArray(context) ||
      !context.some((c) => typeof c === "string" && c.includes("w3.org/ns/credentials"))
    ) {
      issues.push({
        severity: "warn",
        code: "bad-context",
        message: "`@context` does not include `https://www.w3.org/ns/credentials/v1`.",
      });
    }

    if (!target.type) {
      issues.push({
        severity: "error",
        code: "missing-type",
        message: "Missing `type`. Without it the credential says nothing about what it asserts.",
      });
    } else if (!Array.isArray(target.type)) {
      issues.push({
        severity: "warn",
        code: "type-not-array",
        message: "`type` should be an array; JSON-LD 1.1 requires it for repeatable values.",
      });
    }

    const issuer = target.issuer;
    const issuerId =
      typeof issuer === "string" ? issuer : (issuer as { id?: unknown } | undefined)?.id;
    if (issuerId === undefined) {
      issues.push({
        severity: "error",
        code: "missing-issuer",
        message: "Missing `issuer`. BlockID cannot attribute reputation to an anonymous issuer.",
      });
    } else if (typeof issuerId === "string" && !DID_RE.test(issuerId)) {
      issues.push({
        severity: "warn",
        code: "issuer-not-did",
        message: `Issuer "${issuerId.slice(0, 40)}" is not a well-formed DID.`,
      });
    }

    if (!target.credentialSubject) {
      issues.push({
        severity: "error",
        code: "missing-subject",
        message: "Missing `credentialSubject`.",
      });
    }

    if (!target.issuanceDate) {
      issues.push({
        severity: "warn",
        code: "missing-issuance-date",
        message:
          "Missing `issuanceDate`. Expiry and age checks cannot run, and the trust model loses its maturity signal.",
      });
    }

    if (target.expirationDate && target.issuanceDate) {
      const issued = Date.parse(String(target.issuanceDate));
      const expires = Date.parse(String(target.expirationDate));
      if (Number.isFinite(issued) && Number.isFinite(expires) && expires <= issued) {
        issues.push({
          severity: "error",
          code: "bad-window",
          message: "`expirationDate` is not after `issuanceDate` — the credential can never be valid.",
        });
      }
    }

    // proof / signature
    const proof = target.proof as Record<string, unknown> | undefined;
    if (proof) {
      if (proof.type === "Ed25519Signature2020" || proof.type === "JsonWebSignature2020") {
        issues.push({
          severity: "warn",
          code: "legacy-suite",
          message: `${String(proof.type)} is deprecated. Prefer Ed25519Signature2020 with a Multikey controller, or Data Integrity Proof.`,
        });
      }
      if (!proof.verificationMethod) {
        issues.push({
          severity: "error",
          code: "missing-vm",
          message: "Proof has no `verificationMethod`, so the signing key cannot be resolved.",
        });
      }
    } else {
      issues.push({
        severity: "error",
        code: "unsigned",
        message:
          "No `proof` — the credential is unsigned. It asserts a claim without evidence.",
      });
    }
  }

  // VP-level checks
  if (parsed.verifiablePresentation && !parsed.verifiableCredential) {
    issues.push({
      severity: "error",
      code: "vp-without-vc",
      message: "`verifiablePresentation` is present but `verifiableCredential` is missing.",
    });
  }
  if (Array.isArray(parsed.verifiablePresentation) && parsed.verifiablePresentation.length > 1) {
    issues.push({
      severity: "warn",
      code: "nested-vp",
      message: "Nested verifiable presentations. BlockID verifies the outermost one.",
    });
  }
  if (!parsed.verifiablePresentation && !parsed.verifiableCredential) {
    issues.push({
      severity: "error",
      code: "not-a-vp",
      message: "Input is JSON but contains neither `verifiablePresentation` nor `verifiableCredential`.",
    });
  }

  return issues;
}

/** Wrap a bare VC into a minimal VP envelope. */
function wrapInVp(vc: Record<string, unknown>): Record<string, unknown> {
  return {
    verifiablePresentation: {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiablePresentation"],
      verifiableCredential: [vc],
    },
  };
}

interface SchemaValidationPanelProps {
  value: string;
  onApply?: (patched: string) => void;
}

export default function SchemaValidationPanel({ value, onApply }: SchemaValidationPanelProps) {
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState(false);

  const { parsed, issues, parseError } = useMemo(() => {
    const trimmed = value.trim();
    if (!trimmed) return { parsed: null as Record<string, unknown> | null, issues: [] as Issue[], parseError: null as string | null };
    try {
      const p = JSON.parse(trimmed);
      if (!p || typeof p !== "object" || Array.isArray(p)) {
        return { parsed: null, issues: [] as Issue[], parseError: "Top-level value is not a JSON object." };
      }
      const obj = p as Record<string, unknown>;
      return { parsed: obj, issues: validate(obj), parseError: null };
    } catch (err) {
      return {
        parsed: null,
        issues: [] as Issue[],
        parseError: err instanceof Error ? err.message : "Invalid JSON.",
      };
    }
  }, [value]);

  // A bare credential is the one unambiguous repair we offer.
  const canWrap =
    !!parsed &&
    !parsed.verifiablePresentation &&
    !!parsed.verifiableCredential &&
    !!onApply;

  if (!value.trim()) return null;

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warn").length;

  return (
    <div className="rounded-lg border border-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <FileCheck2 className="h-3.5 w-3.5 text-verifier shrink-0" />
        <span className="text-[11px] font-semibold text-foreground">Presentation schema</span>
        {parseError ? (
          <Badge variant="destructive" size="sm">not JSON</Badge>
        ) : errors > 0 ? (
          <Badge variant="destructive" size="sm">{errors} error{errors === 1 ? "" : "s"}</Badge>
        ) : warnings > 0 ? (
          <Badge variant="outline" size="sm" className="border-amber-500/30 text-amber-500">
            {warnings} warning{warnings === 1 ? "" : "s"}
          </Badge>
        ) : (
          <Badge variant="secondary" size="sm" className="border-emerald-500/30 text-emerald-500">
            well-formed
          </Badge>
        )}
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground ml-auto transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-border px-3 py-2.5">
              {parseError ? (
                <div className="flex items-start gap-2 text-[11px] text-destructive">
                  <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Could not parse as JSON: {parseError}
                    <br />
                    <span className="text-muted-foreground">
                      A VP must be a JSON object. Check for a trailing comma, single quotes, or
                      an accidentally truncated paste.
                    </span>
                  </span>
                </div>
              ) : issues.length === 0 ? (
                <div className="flex items-start gap-2 text-[11px] text-emerald-500">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  Envelope looks well-formed. Signature, revocation, and anchoring are checked
                  when you verify.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {issues.map((issue, i) => {
                    const meta = SEVERITY_META[issue.severity];
                    const Icon = meta.icon;
                    return (
                      <li key={`${issue.code}-${i}`} className="flex items-start gap-2">
                        <Icon className={cn("h-3.5 w-3.5 shrink-0 mt-0.5", meta.cls)} />
                        <span className="text-[11px] leading-relaxed text-muted-foreground">
                          <span className="font-mono text-[10px] text-foreground">{issue.code}</span>
                          {" — "}
                          {issue.message}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {canWrap && !applied ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    onApply?.(JSON.stringify(wrapInVp(parsed!), null, 2));
                    setApplied(true);
                  }}
                >
                  <Wand2 className="h-3.5 w-3.5" /> Wrap in a VerifiablePresentation
                </Button>
              ) : null}

              {applied ? (
                <p className="text-[10px] text-emerald-500">
                  Wrapped. Review the result before verifying.
                </p>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
