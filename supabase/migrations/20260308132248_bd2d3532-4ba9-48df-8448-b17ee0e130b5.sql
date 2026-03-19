
-- GDPR consent tracking
CREATE TABLE public.consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  consent_type text NOT NULL,
  granted boolean NOT NULL DEFAULT true,
  purpose text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own consent" ON public.consent_records FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Data deletion requests
CREATE TABLE public.data_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own deletion requests" ON public.data_deletion_requests FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Selective disclosure: store disclosed fields on credential_shares
ALTER TABLE public.credential_shares ADD COLUMN disclosed_fields jsonb DEFAULT NULL;
