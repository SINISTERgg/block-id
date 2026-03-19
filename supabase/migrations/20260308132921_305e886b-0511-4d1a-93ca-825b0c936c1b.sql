
-- OID4VC sessions for tracking credential offers and presentation requests
CREATE TABLE public.oid4vc_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_type text NOT NULL, -- 'credential_offer' or 'presentation_request'
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, claimed, completed, expired
  -- OID4VCI fields
  schema_id uuid REFERENCES public.credential_schemas(id),
  credential_data jsonb DEFAULT '{}',
  pre_authorized_code text UNIQUE,
  -- OID4VP fields  
  presentation_definition jsonb,
  response_data jsonb,
  -- Common
  metadata jsonb DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oid4vc_sessions ENABLE ROW LEVEL SECURITY;

-- Issuers/verifiers can manage their own sessions
CREATE POLICY "Users manage own sessions" ON public.oid4vc_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Anyone can read by pre_authorized_code (for external wallets)
CREATE POLICY "Public read by code" ON public.oid4vc_sessions
  FOR SELECT TO anon, authenticated
  USING (true);
