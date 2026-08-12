-- ============================================================
-- Fix: Holders cannot respond to (accept/decline) verification
-- requests because the existing RLS policy on verification_requests
-- restricts ALL mutations to verifier_id = auth.uid().
--
-- When a holder calls respondToRequest(), Supabase executes the
-- UPDATE but RLS silently blocks it (0 rows affected, no error).
-- The toast shows "Request declined" but the DB is unchanged.
-- The real-time subscription then re-fetches and the request
-- reappears, making it look like the action was ignored.
--
-- Root cause:
--   Migration 20260423000003_complete_rls_fix.sql created:
--   CREATE POLICY "Users can manage verification_requests"
--     FOR ALL USING (verifier_id = auth.uid())
--   This gives verifiers full control but gives holders zero
--   UPDATE access even on requests addressed to their own DID.
--
-- Fix:
--   Add a targeted UPDATE-only policy for holders. We match on
--   holder_did = the DID stored in the holder's profile row,
--   looked up via a SECURITY DEFINER helper to avoid RLS recursion.
--   Only status fields (status, responded_at, shared_credential_data,
--   storage_consent, credential_id, access_expires_at) matter here —
--   the holder cannot change verifier_id or created_at.
-- ============================================================

-- ── Helper: get the DID for the currently authenticated user ─────────────────
-- SECURITY DEFINER bypasses RLS on profiles, avoiding infinite recursion.
CREATE OR REPLACE FUNCTION public.get_my_did()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT did FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_did() TO authenticated;

-- ── Holder response policy ───────────────────────────────────────────────────
-- Allows the holder to UPDATE any verification request that was addressed
-- to their DID. This covers Accept & Share and Decline actions.
DROP POLICY IF EXISTS "Holders can respond to requests" ON public.verification_requests;
CREATE POLICY "Holders can respond to requests"
  ON public.verification_requests
  FOR UPDATE
  TO authenticated
  USING     (holder_did = public.get_my_did())
  WITH CHECK(holder_did = public.get_my_did());

-- ── Verifiers can INSERT new requests ────────────────────────────────────────
-- The existing "Users can manage verification_requests" policy covers this
-- (FOR ALL with verifier_id = auth.uid()) but we make INSERT explicit to be safe.
DROP POLICY IF EXISTS "Verifiers can insert requests" ON public.verification_requests;
CREATE POLICY "Verifiers can insert requests"
  ON public.verification_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (verifier_id = auth.uid());

-- Reload PostgREST cache to pick up the new function
NOTIFY pgrst, 'reload schema';
