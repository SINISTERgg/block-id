-- ============================================================
-- Fix: access_expires_at column missing from PostgREST schema
-- cache for the verification_requests table.
--
-- Root cause: PostgREST's schema cache did not include the
-- access_expires_at column that exists in the baseline DDL,
-- causing "Could not find 'access_expires_at' column" errors
-- when the holder accepts a verification request.
--
-- Solution:
--   1. ADD COLUMN IF NOT EXISTS — idempotent, safe if column
--      already exists in the live DB.
--   2. NOTIFY pgrst, 'reload schema' — signals PostgREST to
--      immediately discard and re-read the pg_catalog, so the
--      column becomes visible to the API without a server restart.
-- ============================================================

-- Ensure the column exists in the live database
ALTER TABLE public.verification_requests
  ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ DEFAULT NULL;

-- Force PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';
