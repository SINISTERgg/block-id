/**
 * Ambient module declaration — snarkjs ships without TypeScript types.
 * Only the Groth16 surface used by src/services/zkp/zkp.service.ts is declared;
 * runtime artifacts are loaded dynamically.
 */
declare module "snarkjs" {
  interface Groth16ProofJson {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol?: string;
    curve?: string;
  }

  interface Groth16PublicSignal {
    [key: string]: unknown;
  }

  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasmUrl: string,
      zkeyUrl: string
    ): Promise<{ proof: Groth16ProofJson; publicSignals: string[] }>;
    verify(
      vkey: unknown,
      publicSignals: string[],
      proof: Groth16ProofJson
    ): Promise<boolean>;
  };
}
