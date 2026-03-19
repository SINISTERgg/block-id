
-- Trusted Issuer Registry
CREATE TABLE public.trusted_issuers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_did text NOT NULL UNIQUE,
  issuer_user_id uuid,
  organization_name text NOT NULL,
  domain text,
  verification_status text NOT NULL DEFAULT 'pending',
  verified_at timestamptz,
  verified_by uuid,
  trust_level text NOT NULL DEFAULT 'standard',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trusted_issuers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read trusted issuers" ON public.trusted_issuers FOR SELECT USING (true);
CREATE POLICY "Issuers can register themselves" ON public.trusted_issuers FOR INSERT WITH CHECK (has_role(auth.uid(), 'issuer'));
CREATE POLICY "Issuers can update own entry" ON public.trusted_issuers FOR UPDATE USING (issuer_user_id = auth.uid());

CREATE INDEX idx_trusted_issuers_did ON public.trusted_issuers(issuer_did);
CREATE INDEX idx_trusted_issuers_status ON public.trusted_issuers(verification_status);

-- Status List for StatusList2021
CREATE TABLE public.status_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_id uuid NOT NULL,
  purpose text NOT NULL DEFAULT 'revocation',
  encoded_list text NOT NULL DEFAULT '',
  status_size integer NOT NULL DEFAULT 1,
  total_entries integer NOT NULL DEFAULT 131072,
  next_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.status_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Issuers manage own status lists" ON public.status_lists FOR ALL USING (issuer_id = auth.uid()) WITH CHECK (issuer_id = auth.uid());
CREATE POLICY "Anyone can read status lists" ON public.status_lists FOR SELECT USING (true);

-- Add status_list_index to credentials
ALTER TABLE public.credentials ADD COLUMN status_list_id uuid REFERENCES public.status_lists(id);
ALTER TABLE public.credentials ADD COLUMN status_list_index integer;
