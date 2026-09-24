/**
 * BlockID — Verifier Data
 * ──────────────────────
 * Shared verifier constants. Sample/template VP payloads were removed:
 * they contained placeholder data (fake did:example:holder DIDs and
 * "REPLACE_WITH_CREDENTIAL_ID") that must not ship in production.
 */

export const CREDENTIAL_TYPE_OPTIONS = [
  { value: "degree", label: "Degree" },
  { value: "diploma", label: "Diploma" },
  { value: "certificate", label: "Certificate" },
  { value: "transcript", label: "Transcript" },
];
