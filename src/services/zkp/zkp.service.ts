/**
 * ZKP service — client-side Groth16 proving via snarkjs.
 *
 * Proof artifacts (wasm/zkey/vkey) are produced by `npm run build:circuits`
 * and served from `public/zkp/<circuit>/`. When artifacts are missing the
 * service degrades gracefully: input building and nullifier computation still
 * work (fully tested), while fullProve throws a descriptive setup error.
 */
import {
  buildAgeVerifySignals,
  buildAttributeRangeSignals,
  computeNullifier,
  isValidProofShape,
  toVerifierCalldata,
  type AgeProofInput,
  type AttributeRangeInput,
  type CircuitName,
  type Groth16ProofJson,
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
    fullProve(input: unknown, wasm: string, zkey: string): Promise<{ proof: Groth16ProofJson; publicSignals: string[] }>;
    verify(vkey: unknown, publicSignals: string[], proof: Groth16ProofJson): Promise<boolean>;
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
  publicSignals: string[];
  circuit: CircuitName;
}

async function prove(
  circuit: CircuitName,
  circuitInputs: Record<string, unknown>,
  publicSignals: string[]
): Promise<GeneratedProof> {
  const snarkjs = await loadSnarkjs();
  if (!snarkjs) throw new Error("snarkjs is not installed — run `npm install snarkjs`");

  const { wasmUrl, zkeyUrl } = getArtifactPaths(circuit);
  const { proof, publicSignals: signals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    wasmUrl,
    zkeyUrl
  );
  if (!isValidProofShape(proof)) throw new Error("Malformed proof returned by snarkjs");
  return { proof: toVerifierCalldata(proof), publicSignals: signals.length ? signals : publicSignals, circuit };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Prove that the holder's age ≥ threshold without revealing their birth date.
 * Returns null when the holder is underage (nothing to prove).
 */
export async function generateAgeProof(
  input: AgeProofInput,
  secret: string,
  scope: string
): Promise<GeneratedProof | null> {
  const built = buildAgeVerifySignals(input);
  if (!built.isAdult) return null;

  const nullifier = computeNullifier(secret, scope, "age-verify");
  return prove("age-verify", { birthTimestamp: built.privateInputs[0] }, [
    ...built.publicInputs,
    nullifier,
  ]);
}

/**
 * Prove that a private attribute lies within [minValue, maxValue].
 * Returns null when out of range.
 */
export async function generateAttributeProof(
  input: AttributeRangeInput,
  secret: string,
  scope: string
): Promise<GeneratedProof | null> {
  const built = buildAttributeRangeSignals(input);
  if (!built.inRange) return null;

  const nullifier = computeNullifier(secret, scope, "attribute-range");
  return prove("attribute-range", { value: built.privateInputs[0] }, [
    ...built.publicInputs,
    nullifier,
  ]);
}

/**
 * Prove membership of an issuer leaf in a trusted-issuer Merkle tree.
 */
export async function generateIssuerProof(
  leaf: string,
  pathElements: string[],
  pathIndices: (0 | 1)[],
  root: string,
  scope: string,
  secret: string
): Promise<GeneratedProof> {
  const nullifier = computeNullifier(secret, scope, "issuer-membership");
  return prove(
    "issuer-membership",
    { leaf, pathElements, pathIndices },
    [root, scope, nullifier]
  );
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
