/**
 * BlockID — Verifier Sample VP Library
 * ─────────────────────────────────────
 * Ready-to-use Verifiable Presentation templates. Paste a sample into the
 * verify dialog, replace the credential_id placeholder, and hit verify.
 */

export interface SampleVP {
  id: string;
  label: string;
  type: string;
  description: string;
  vpJson: string;
}

const makeVp = (id: string, label: string, type: string, description: string, credentialId: string): SampleVP => ({
  id,
  label,
  type,
  description,
  vpJson: JSON.stringify(
    {
      "@context": [
        "https://www.w3.org/2018/credentials/v1",
        "https://www.w3.org/2018/credentials/examples/v1",
      ],
      type: ["VerifiablePresentation"],
      verifiableCredential: {
        id: credentialId,
        type: [type, "VerifiableCredential"],
      },
      holder: "did:example:holder",
      proof: {
        type: "PresentationProof",
        created: new Date().toISOString(),
        proofPurpose: "authentication",
      },
    },
    null,
    2
  ),
});

export const SAMPLE_VPS: SampleVP[] = [
  makeVp(
    "vp-degree",
    "Degree Credential",
    "degree",
    "Template VP wrapping a degree credential by ID",
    "REPLACE_WITH_CREDENTIAL_ID"
  ),
  makeVp(
    "vp-diploma",
    "Diploma Credential",
    "diploma",
    "Template VP wrapping a diploma credential by ID",
    "REPLACE_WITH_CREDENTIAL_ID"
  ),
  makeVp(
    "vp-certificate",
    "Certificate Credential",
    "certificate",
    "Template VP wrapping a professional certificate by ID",
    "REPLACE_WITH_CREDENTIAL_ID"
  ),
  makeVp(
    "vp-transcript",
    "Transcript Credential",
    "transcript",
    "Template VP wrapping an academic transcript by ID",
    "REPLACE_WITH_CREDENTIAL_ID"
  ),
];

export interface SampleCredentialId {
  id: string;
  label: string;
  type: string;
  credentialId: string;
  description: string;
}

/** Quick-verify presets keyed by credential_id (for one-click checks). */
export const SAMPLE_CREDENTIAL_IDS: SampleCredentialId[] = [
  {
    id: "qc-by-id",
    label: "Verify by Credential ID",
    type: "credential_id",
    credentialId: "",
    description: "Look up a credential directly in the registry by its UUID",
  },
];

export const CREDENTIAL_TYPE_OPTIONS = [
  { value: "degree", label: "Degree" },
  { value: "diploma", label: "Diploma" },
  { value: "certificate", label: "Certificate" },
  { value: "transcript", label: "Transcript" },
];
