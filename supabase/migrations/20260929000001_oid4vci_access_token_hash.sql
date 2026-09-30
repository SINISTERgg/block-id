-- OID4VCI: store only a hash of the credential-endpoint access token.
--
-- The token endpoint used to write the plaintext access token into
-- `oid4vc_sessions.metadata`, and the credential endpoint selected every
-- `claimed` session and compared the raw token in JS. That is O(active offers)
-- per issuance and leaves a replayable bearer secret in a JSONB column.
--
-- `access_token_hash` is indexed so the lookup is a single-row equality match.
-- Existing claimed sessions are invalidated on purpose: they still carry a
-- plaintext token that must stop working.

ALTER TABLE public.oid4vc_sessions
  ADD COLUMN IF NOT EXISTS access_token_hash TEXT;

COMMENT ON COLUMN public.oid4vc_sessions.access_token_hash IS
  'SHA-256 hex of the OID4VCI credential-endpoint access token. The plaintext token is returned once at the token endpoint and never stored.';

-- Retire any session issued under the old scheme.
UPDATE public.oid4vc_sessions
SET status = 'pending', metadata = metadata - 'access_token', updated_at = now()
WHERE status = 'claimed' AND access_token_hash IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS oid4vc_sessions_access_token_hash_idx
  ON public.oid4vc_sessions (access_token_hash)
  WHERE access_token_hash IS NOT NULL;
