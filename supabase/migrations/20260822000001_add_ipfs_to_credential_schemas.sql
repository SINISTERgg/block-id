-- Phase 3: Decentralized Storage & IPFS
-- Adds IPFS pinning metadata to credential_schemas so every schema definition
-- can be resolved from a content-addressed location (ipfs://<cid>) instead of
-- relying solely on the central database.

ALTER TABLE public.credential_schemas
  ADD COLUMN IF NOT EXISTS ipfs_cid TEXT,
  ADD COLUMN IF NOT EXISTS ipfs_pinned_at TIMESTAMPTZ;

COMMENT ON COLUMN public.credential_schemas.ipfs_cid IS 'Content Identifier (CIDv0/CIDv1) of the schema JSON-LD pinned on IPFS';
COMMENT ON COLUMN public.credential_schemas.ipfs_pinned_at IS 'Timestamp of the most recent successful IPFS pin';

CREATE INDEX IF NOT EXISTS idx_credential_schemas_ipfs_cid
  ON public.credential_schemas (ipfs_cid)
  WHERE ipfs_cid IS NOT NULL;
