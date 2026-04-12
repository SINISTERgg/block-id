-- Verifier Portal: Time-Limited Document Access & Consent-Based Storage
-- Adds columns to verification_requests for shared credential data,
-- time-limited access, and holder storage consent.

-- 1. Add new columns
ALTER TABLE public.verification_requests
  ADD COLUMN IF NOT EXISTS shared_credential_data JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS storage_consent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Allow verifiers to read shared data only while access hasn't expired or storage is consented
-- (The existing "Verifiers can manage requests" FOR ALL policy already covers reads,
--  so we enforce expiry client-side. No new RLS policy needed for this.)
