/**
 * Client entry point for the BlockID trust engine.
 *
 * The implementation lives in `supabase/functions/_shared/credentialEngine.ts`
 * because that is the copy the edge functions execute. This file re-exports it
 * so the browser, the tests and the server all bind to literally the same
 * module instance — one set of weights, one set of thresholds, one set of
 * hard-fail caps.
 *
 * Previously `src/lib/ml/trustScore.ts` and `verify-credential/ai-engine.ts`
 * each carried their own weight table, and a verifier was shown two different
 * scores for the same credential depending on which component rendered it.
 */

export * from "../../../supabase/functions/_shared/credentialEngine.ts";
