-- Phase 4: SIWE nonce storage (EIP-4361 challenge/replay prevention)
CREATE TABLE IF NOT EXISTS public.siwe_nonces (
  nonce TEXT PRIMARY KEY,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  used_at TIMESTAMPTZ DEFAULT NULL
);

ALTER TABLE public.siwe_nonces ENABLE ROW LEVEL SECURITY;

-- Nonces are managed exclusively by the service role via edge functions;
-- no policies are defined, so clients cannot read or write them directly.

CREATE INDEX IF NOT EXISTS idx_siwe_nonces_expires ON public.siwe_nonces (expires_at);

-- Housekeeping: drop consumed/expired nonces older than a day.
CREATE OR REPLACE FUNCTION public.prune_siwe_nonces()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.siwe_nonces
  WHERE used_at IS NOT NULL
     OR expires_at < now() - interval '1 day';
END;
$$;

