
-- 1. Audit logs table
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb DEFAULT '{}',
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own audit logs" ON public.audit_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Issuers can read all audit logs" ON public.audit_logs FOR SELECT USING (has_role(auth.uid(), 'issuer'));
CREATE POLICY "Service role inserts audit logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- 2. Schema versioning
ALTER TABLE public.credential_schemas ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE public.credential_schemas ADD COLUMN parent_schema_id uuid REFERENCES public.credential_schemas(id);
ALTER TABLE public.credential_schemas ADD COLUMN is_latest boolean NOT NULL DEFAULT true;

-- 3. Add issuer_signature column to credentials for real crypto sigs
ALTER TABLE public.credentials ADD COLUMN issuer_signature text;
ALTER TABLE public.credentials ADD COLUMN signer_address text;
