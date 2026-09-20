-- ============================================================
-- C3: Require the share token to access shared credentials
--
-- Problem: `credential_shares` was `FOR SELECT USING (true)` for
-- anon+authenticated, and the credentials policy
-- `"Read credentials via share token"` matched rows only by
-- `expires_at > now()` — never validating the secret token. Any
-- anonymous caller could enumerate every share and read the full
-- `credential_data` of every shared VC without a token.
--
-- Fix:
--   • Restrict `credential_shares` SELECT to the share OWNER
--     (authenticated, holder_id = auth.uid()).
--   • Drop the token-less anon read on `credentials`.
--   • Expose `get_shared_credential(p_token)` — a SECURITY
--     DEFINER RPC that validates the exact token + expiry and
--     returns only the public/shared fields. The token itself is
--     the capability; it is never echoed back and share rows are
--     not listable by strangers.
-- ============================================================

-- 1. credential_shares: owner-only SELECT (replaces anon USING(true))
DROP POLICY IF EXISTS "Anyone can read credential_shares by token"
  ON public.credential_shares;
DROP POLICY IF EXISTS "All can read credential_shares"
  ON public.credential_shares;

CREATE POLICY "Holders can read own shares"
  ON public.credential_shares
  FOR SELECT
  TO authenticated
  USING (holder_id = auth.uid());

-- 2. credentials: remove token-less anon/authenticated read
DROP POLICY IF EXISTS "Read credentials via share token"
  ON public.credentials;

-- 3. Token-gated RPC (this is the ONLY path for share links)
CREATE OR REPLACE FUNCTION public.get_shared_credential(p_token TEXT)
RETURNS TABLE (
  credential_data JSONB,
  credential_hash TEXT,
  blockchain_anchor TEXT,
  status TEXT,
  issued_at TIMESTAMPTZ,
  schema_name TEXT,
  schema_type TEXT,
  expires_at TIMESTAMPTZ,
  disclosed_fields JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    c.credential_data,
    c.credential_hash,
    c.blockchain_anchor,
    c.status,
    c.issued_at,
    sc.name,
    sc.credential_type,
    s.expires_at,
    s.disclosed_fields
  FROM public.credential_shares s
  JOIN public.credentials c ON c.id = s.credential_id
  LEFT JOIN public.credential_schemas sc ON sc.id = c.schema_id
  WHERE s.token = p_token
    AND s.expires_at > now()
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_credential(TEXT)
  TO anon, authenticated;