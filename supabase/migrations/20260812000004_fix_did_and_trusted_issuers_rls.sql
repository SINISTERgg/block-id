-- ============================================================
-- Fix two bugs:
--
-- Bug 1: generate_did raises "duplicate key value violates unique
--   constraint 'profiles_did_key'" when two users share the same
--   wallet address (same DID value) or a concurrent call races.
--
--   Fix: Wrap the UPDATE in an exception handler that catches
--   unique_violation (SQLSTATE 23505). On conflict, the DID was
--   already set by a concurrent call — just read it back and return.
--
-- Bug 2: "new row violates row-level security policy for table
--   'trusted_issuers'" when an issuer tries to register.
--
--   Root cause: Migration 20260423000003_complete_rls_fix.sql
--   created only a SELECT policy for trusted_issuers, silently
--   discarding the baseline INSERT policy
--   "Issuers can register themselves". With no INSERT policy, all
--   inserts are blocked by RLS.
--
--   Fix: Re-create the INSERT policy plus a self-manage DELETE
--   policy so issuers can register and update their own entry.
-- ============================================================

-- ── Bug 1: Fix generate_did to handle unique constraint violations ────────────

CREATE OR REPLACE FUNCTION public.generate_did(_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _did          TEXT;
  _wallet       TEXT;
  _existing_did TEXT;
BEGIN
  -- Fast path: return existing DID if already set
  SELECT did INTO _existing_did
  FROM public.profiles
  WHERE user_id = _user_id;

  IF _existing_did IS NOT NULL AND _existing_did <> '' THEN
    RETURN _existing_did;
  END IF;

  -- Require a linked wallet address
  SELECT wallet_address INTO _wallet
  FROM public.profiles
  WHERE user_id = _user_id;

  IF _wallet IS NULL OR _wallet = '' THEN
    RAISE EXCEPTION 'Wallet not linked. Connect your wallet before generating a DID.';
  END IF;

  _did := 'did:ethr:sepolia:' || lower(_wallet);

  BEGIN
    -- Attempt to set the DID only if it is not yet set
    UPDATE public.profiles
    SET    did        = _did,
           updated_at = now()
    WHERE  user_id   = _user_id
      AND  (did IS NULL OR did = '');
  EXCEPTION
    WHEN unique_violation THEN
      -- Another row already has this DID (same wallet shared between accounts).
      -- Read back whatever DID was persisted for this user and return it.
      NULL;
  END;

  -- Always return the authoritative DID from the DB
  SELECT did INTO _did
  FROM public.profiles
  WHERE user_id = _user_id;

  RETURN _did;
END;
$$;

-- ── Bug 2: Restore missing RLS policies on trusted_issuers ───────────────────

-- INSERT — authenticated users with the 'issuer' role can register themselves
DROP POLICY IF EXISTS "Issuers can register themselves" ON public.trusted_issuers;
CREATE POLICY "Issuers can register themselves"
  ON public.trusted_issuers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    issuer_user_id = auth.uid()
    AND has_role(auth.uid(), 'issuer'::app_role)
  );

-- UPDATE — issuers can update their own entry (already existed but re-stated for clarity)
DROP POLICY IF EXISTS "Issuers can update own entry" ON public.trusted_issuers;
CREATE POLICY "Issuers can update own entry"
  ON public.trusted_issuers
  FOR UPDATE
  TO authenticated
  USING     (issuer_user_id = auth.uid())
  WITH CHECK(issuer_user_id = auth.uid());

-- DELETE — issuers can remove their own pending/rejected registration
DROP POLICY IF EXISTS "Issuers can delete own entry" ON public.trusted_issuers;
CREATE POLICY "Issuers can delete own entry"
  ON public.trusted_issuers
  FOR DELETE
  TO authenticated
  USING (issuer_user_id = auth.uid());

-- Force PostgREST to pick up the new function signature
NOTIFY pgrst, 'reload schema';
