/**
 * Barrel re-export for all ZKP sub-modules.
 * Import from "@/lib/zkp" to access all ZKP utilities.
 * This keeps existing import paths working after the split.
 */

export * from "./types";
export * from "./hash";
export * from "./proofBuilder";
export * from "./merkle";
