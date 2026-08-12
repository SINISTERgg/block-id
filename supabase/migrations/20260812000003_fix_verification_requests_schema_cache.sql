-- ============================================================
-- Fix: PostgREST schema cache missing multiple columns on the
-- verification_requests table.
--
-- Symptom: "Could not find the 'responded_at' column of
-- 'verification_requests' in the schema cache"
-- (previously also 'access_expires_at')
--
-- Root cause: The live Supabase project's PostgREST instance has
-- a stale schema cache that does not include columns defined in
-- the baseline migration. This happens when the table was
-- re-created or the PostgREST pod restarted before picking up
-- all column definitions.
--
-- Fix: Idempotently ensure every column from the baseline DDL
-- exists in the live table, then force a schema reload.
-- ============================================================

-- Ensure every column from the baseline DDL exists (safe to run repeatedly)
ALTER TABLE public.verification_requests
  ADD COLUMN IF NOT EXISTS credential_id      UUID          REFERENCES public.credentials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS holder_did         TEXT,
  ADD COLUMN IF NOT EXISTS credential_type    TEXT,
  ADD COLUMN IF NOT EXISTS purpose            TEXT          DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_analysis        JSONB,
  ADD COLUMN IF NOT EXISTS shared_credential_data JSONB     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS access_expires_at  TIMESTAMPTZ   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS storage_consent    BOOLEAN       DEFAULT false,
  ADD COLUMN IF NOT EXISTS responded_at       TIMESTAMPTZ   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS verified_at        TIMESTAMPTZ;

-- Force PostgREST to immediately reload its schema cache.
-- This is the primary fix — even if all columns already exist, the
-- NOTIFY is what clears the stale cache on the running process.
NOTIFY pgrst, 'reload schema';
