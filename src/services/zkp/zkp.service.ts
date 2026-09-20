/**
 * ZKP service — client-side Groth16 proving via snarkjs.
 *
 * Proof artifacts (wasm/zkey/vkey) are produced by `npm run build:circuits`
 * and served from `public/zkp/<circuit>/`. When artifacts are missing the
 * service degrades gracefully: input building still works (fully tested),
 * while fullProve throws a descriptive setup error.
 *
 * Circuit input design (SHA-256 ‖ Poseidon binding)
 * ────────────────────────────────────────────
 * Each circuit receives:
 *   • `secret`        (private)  — holder's 253-bit random secret
 *   • `scope`         (public)   — verifier domain-separation tag
 *   • `vcFingerprint` (public)   — SHA-256(canonicalVC JSON) as Hi/Lo halves
 *
 * The circuit computes inside the SNARK:
 *   • `vcCommitment = Poseidon(vcFingerprintHi, vcFingerprintLo, secret)` — PUBLIC output
 *   • `nullifier    = Poseidon(secret, scope, challenge)`                 — PUBLIC output
 *
 * This makes both the nullifier AND the VC commitment cryptographically
 * bound to the proof witness — neither can be forged without the private secret.
 *
 * snarkjs public signal layouts (circom emits OUTPUTS FIRST, then public inputs):
 *   age-verify:        [vcCommitment(0), nullifier(1), refTs(2), minAge(3), scope(4), challenge(5), vcFpHi(6), vcFpLo(7), holderCommitment(8)]
 *   attribute-range:   [vcCommitment(0), nullifier(1), minVal(2), maxVal(3), scope(4), challenge(5), vcFpHi(6), vcFpLo(7), holderCommitment(8)]
 *   issuer-membership: [vcCommitment(0), nullifier(1), root(2), scope(3), challenge(4), vcFpHi(5), vcFpLo(6), holderCommitment(7)]
 *
 * ZKPVerifier.sol burns pubSignals[1] (nullifier) for on-chain replay protection.
import {
  buildAgeVerifyInputs,
  buildAttributeRangeInputs,
  buildIssuerMembershipInputs,
  extractPublicSignal,
  fieldFromString,
  isExpectedSignalCount,
  isValidProofShape,
  publicSignalCount,
  toVerifierCalldata,
  type AgeProofInput,
  type AttributeRangeInput,
  type CircuitName,
  type Groth16ProofJson,
  type IssuerMembershipInput,
  type ZKPCalldata,
} from "@/lib/zkp";

const ARTIFACT_BASE = "/zkp";

export interface ZkpArtifacts {
  wasmUrl: string;
  zkeyUrl: string;
  vkeyUrl: string;
}

export function getArtifactPaths(circuit: CircuitName): ZkpArtifacts {
  return {
    wasmUrl: `${ARTIFACT_BASE}/${circuit}/${circuit}.wasm`,
    zkeyUrl: `${ARTIFACT_BASE}/${circuit}/${circuit}_final.zkey`,
    vkeyUrl: `${ARTIFACT_BASE}/${circuit}/verification_key.json`,
  };
}

/** True when the compiled circuit artifacts are deployed for this circuit. */
export async function areArtifactsAvailable(circuit: CircuitName): Promise<boolean> {
  const { vkeyUrl } = getArtifactPaths(circuit);
  try {
    const res = await fetch(vkeyUrl, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

type SnarkJsModule = {
  groth16: {
    fullProve(
      input: unknown,
      wasm: string,
      zkey: string
    ): Promise<{ proof: Groth16ProofJson; publicSignals: string[] }>;
    verify(
      vkey: unknown,
      publicSignals: string[],
      proof: Groth16ProofJson
    ): Promise<boolean>;
  };
};

let snarkjsPromise: Promise<SnarkJsModule | null> | null = null;

async function loadSnarkjs(): Promise<SnarkJsModule | null> {
  if (!snarkjsPromise) {
    snarkjsPromise = import("snarkjs")
      .then((m) => (m as unknown as { default?: SnarkJsModule })?.default ?? (m as unknown as SnarkJsModule))
      .catch(() => null);
  }
  return snarkjsPromise;
}

export interface GeneratedProof {
  proof: ZKPCalldata;
  /** Raw public signals as returned by snarkjs (outputs first). */
  publicSignals: string[];
  circuit: CircuitName;
  /**
   * The nullifier extracted from publicSignals[1] (always index 1 — circom
   * emits outputs before public inputs). Use this for on-chain submission —
   * ZKPVerifier.sol burns it on verify.
   */
  nullifier: string;
  /**
   * The VC commitment extracted from publicSignals[0].
   * vcCommitment = Poseidon(vcFingerprintHi, vcFingerprintLo, secret) as
   * computed inside the circuit. The on-chain verifier can cross-check this
   * against a stored holder commitment if required by the application protocol.
   */
  vcCommitment: string;
}

/**
 * Core proving function.
 * `circuitInputs` is the full object with all private + public signals.
 * `publicSignals` is an array used for client-side pre-verification (before
 * the actual proof is generated); snarkjs overwrites this with its output.
 */
async function prove(
  circuit: CircuitName,
  circuitInputs: Record<string, unknown>
): Promise<GeneratedProof> {
  const snarkjs = await loadSnarkjs();
  if (!snarkjs) throw new Error("snarkjs is not installed — run `npm install snarkjs`");

  const { wasmUrl, zkeyUrl } = getArtifactPaths(circuit);
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    wasmUrl,
    zkeyUrl
  );
  if (!isValidProofShape(proof)) throw new Error("Malformed proof returned by snarkjs");

  // Signal ordering is defined once in zkp.ts (PUBLIC_SIGNAL_LAYOUT) and
  // verified against real proofs: circom emits OUTPUTS first.
  //   age / attribute : [vcCommitment(0), nullifier(1), publicInputs(2..8)]
  //   issuer          : [vcCommitment(0), nullifier(1), publicInputs(2..7)]
  if (!isExpectedSignalCount(circuit, publicSignals)) {
    throw new Error(
      `${circuit}: expected ${publicSignalCount(circuit)} public signals, got ${publicSignals.length}.` +
        ` Circuit artifacts out of sync with zkp.ts — rebuild with: npm run build:circuits`
    );
  }
  const nullifier = extractPublicSignal(circuit, "nullifier", publicSignals);
  const vcCommitment = extractPublicSignal(circuit, "vcCommitment", publicSignals);

  return {
    proof: toVerifierCalldata(proof),
    publicSignals,
    circuit,
    nullifier,
    vcCommitment,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Prove that the holder's age ≥ threshold without revealing their birth date.
 *
 * The secret is reduced to a BN254 field element via keccak256 mod r before
 * being passed into the circuit. The scope separates proofs across verifier
 * domains so a proof accepted by verifier A cannot be replayed at verifier B.
 * The vcFingerprint (SHA-256 of the canonical VC JSON, supplied via input.vcFingerprint)
 * is field-reduced and passed to the circuit to produce the VC commitment binding.
 *
 * Returns null when the holder is underage — fullProve would fail on witness
 * generation in that case, so we short-circuit early.
 */
export async function generateAgeProof(
  input: AgeProofInput,
  secret: string,
  scope: string
): Promise<GeneratedProof | null> {
  const { circuitInputs, isAdult } = buildAgeVerifyInputs(input, secret, scope);
  if (!isAdult) return null;
  return prove("age-verify", circuitInputs);
}

/**
 * Prove that a private attribute lies within [minValue, maxValue].
 *
 * The vcFingerprint (SHA-256 of the canonical VC JSON, supplied via
 * input.vcFingerprint) is field-reduced and passed to the circuit to produce
 * the VC commitment binding.
 *
 * Returns null when out of range.
 */
export async function generateAttributeProof(
  input: AttributeRangeInput,
  secret: string,
  scope: string
): Promise<GeneratedProof | null> {
  const { circuitInputs, inRange } = buildAttributeRangeInputs(input, secret, scope);
  if (!inRange) return null;
  return prove("attribute-range", circuitInputs);
}

/**
 * Prove membership of an issuer leaf in a trusted-issuer Merkle tree.
 *
 * The `secret` binds the holder's identity to the proof. The `scope` prevents
 * cross-verifier replay. The `leaf` should be the field-reduced hash of the
 * issuer's DID or identifier, matching the off-chain tree construction.
 */
export async function generateIssuerProof(
  input: IssuerMembershipInput
): Promise<GeneratedProof> {
  const { circuitInputs } = buildIssuerMembershipInputs(input);
  return prove("issuer-membership", circuitInputs);
}

/**
 * Convert a scope string to its BN254 field element representation.
 * Use this to derive the `scope` value you store/compare on-chain.
 */
export function scopeToField(scope: string): string {
  return fieldFromString(scope).toString();
}

/** Locally verify a generated proof against the circuit's verification key. */
export async function verifyProofLocally(generated: GeneratedProof): Promise<boolean> {
  const snarkjs = await loadSnarkjs();
  if (!snarkjs) throw new Error("snarkjs is not installed — run `npm install snarkjs`");

  const { vkeyUrl } = getArtifactPaths(generated.circuit);
  const res = await fetch(vkeyUrl);
  if (!res.ok) throw new Error(`Verification key missing for ${generated.circuit}`);
  const vkey = await res.json();
  return snarkjs.groth16.verify(vkey, generated.publicSignals, reverseCalldata(generated.proof));
}

/** Convert calldata-shaped proof back to snarkjs JSON shape for local verify. */
function reverseCalldata(calldata: ZKPCalldata): Groth16ProofJson {
  return {
    pi_a: [calldata.a[0], calldata.a[1], "1"],
    pi_b: [
      [calldata.b[0][0], calldata.b[0][1]],
      [calldata.b[1][0], calldata.b[1][1]],
      "1",
    ],
    pi_c: [calldata.c[0], calldata.c[1], "1"],
  };
}
