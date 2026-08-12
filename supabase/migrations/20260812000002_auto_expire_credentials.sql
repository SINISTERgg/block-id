-- ============================================================
-- Fix: Credentials not expiring automatically when expires_at passes
--
-- Root cause: The expires_at column is stored correctly at issuance
-- but no mechanism ever flips status from 'active' → 'expired'.
-- The UI reads c.status directly from the DB, which stays 'active'
-- indefinitely.
--
-- Solution (three-part):
--   1. A trigger function that marks credentials expired on write
--      (fires on every INSERT or UPDATE to credentials table).
--   2. A helper RPC function `expire_stale_credentials()` that can
--      be called from the client at page-load to sweep stale rows.
--   3. An immediate UPDATE to fix all already-stale rows now.
-- ============================================================

-- ── Part 1: Trigger function ─────────────────────────────────────────────────
-- Called automatically on every credentials INSERT / UPDATE.
-- If expires_at is set and has passed and status is still 'active',
-- flip it to 'expired' in-place.

CREATE OR REPLACE FUNCTION public.auto_expire_credential()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.expires_at IS NOT NULL
     AND NEW.expires_at < now()
     AND NEW.status = 'active'
  THEN
    NEW.status := 'expired';
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to credentials table (BEFORE so the change is in the same TX)
DROP TRIGGER IF EXISTS trg_auto_expire_credential ON public.credentials;
CREATE TRIGGER trg_auto_expire_credential
  BEFORE INSERT OR UPDATE ON public.credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_expire_credential();

-- ── Part 2: Sweep RPC callable from the frontend ─────────────────────────────
-- Marks all credentials whose expires_at has passed as 'expired'.
-- Returns the count of rows updated.
-- Called by the client at wallet/credential load time.

CREATE OR REPLACE FUNCTION public.expire_stale_credentials()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.credentials
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < now();

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Grant execute to authenticated users (each user only expires their own
-- credentials indirectly — RLS on credentials table still applies for reads)
GRANT EXECUTE ON FUNCTION public.expire_stale_credentials() TO authenticated;

-- ── Part 3: Fix existing stale rows immediately ───────────────────────────────
-- Backfill all credentials that are past their expires_at but still 'active'.

UPDATE public.credentials
SET status = 'expired'
WHERE status = 'active'
  AND expires_at IS NOT NULL
  AND expires_at < now();

-- Notify PostgREST to reload schema (picks up the new RPC)
NOTIFY pgrst, 'reload schema';
