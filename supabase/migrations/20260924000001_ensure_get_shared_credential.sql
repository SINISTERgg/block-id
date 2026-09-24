-- ============================================================
-- Ensure get_shared_credential RPC exists and is callable by anon.
--
-- This is a safety re-application of the function from migration
-- 20260919000002_secure_share_tokens.sql. The SECURITY DEFINER
-- function bypasses RLS to perform a safe, token-gated lookup
-- of credential share data. It is the ONLY path for /shared/:token.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_shared_credential(p_token TEXT)
RETURNS TABLE (
  credential_data   JSONB,
  credential_hash   TEXT,
  blockchain_anchor TEXT,
  status            TEXT,
  issued_at         TIMESTAMPTZ,
  schema_name       TEXT,
  schema_type       TEXT,
  expires_at        TIMESTAMPTZ,
  disclosed_fields  JSONB
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

-- Grant to anon so unauthenticated users can view shared links
GRANT EXECUTE ON FUNCTION public.get_shared_credential(TEXT)
  TO anon, authenticated;

-- Ensure holders can INSERT/manage shares (needed for ShareCredentialDialog)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'credential_shares'
      AND policyname = 'Holders can manage own shares'
  ) THEN
    CREATE POLICY "Holders can manage own shares"
      ON public.credential_shares
      FOR ALL
      TO authenticated
      USING  (holder_id = auth.uid())
      WITH CHECK (holder_id = auth.uid());
  END IF;
END $$;

-- Ensure the owner-only SELECT policy exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'credential_shares'
      AND policyname = 'Holders can read own shares'
  ) THEN
    CREATE POLICY "Holders can read own shares"
      ON public.credential_shares
      FOR SELECT
      TO authenticated
      USING (holder_id = auth.uid());
  END IF;
END $$;

-- Force PostgREST to pick up the new function immediately
NOTIFY pgrst, 'reload schema';
