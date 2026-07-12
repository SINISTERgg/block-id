-- ============================================================
-- BlockID Platform — Consolidated Baseline Migration
-- This is the complete database schema for the BlockID platform.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── Enums ────────────────────────────────────────────────────────
CREATE TYPE public.app_role AS ENUM ('issuer', 'holder', 'verifier', 'org_admin');

-- ── Core Tables ──────────────────────────────────────────────────

-- User roles (separate from profiles per security guidelines)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  organization TEXT DEFAULT '',
  did TEXT UNIQUE,
  biometric_registered BOOLEAN DEFAULT false,
  face_registered BOOLEAN DEFAULT false,
  wallet_address TEXT DEFAULT NULL,
  account_status TEXT NOT NULL DEFAULT 'approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Credential schemas
CREATE TABLE public.credential_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  credential_type TEXT NOT NULL DEFAULT 'certificate',
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  parent_schema_id UUID REFERENCES public.credential_schemas(id),
  is_latest BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.credential_schemas ENABLE ROW LEVEL SECURITY;

-- Status Lists (StatusList2021)
CREATE TABLE public.status_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_id UUID NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'revocation',
  encoded_list TEXT NOT NULL DEFAULT '',
  status_size INTEGER NOT NULL DEFAULT 1,
  total_entries INTEGER NOT NULL DEFAULT 131072,
  next_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.status_lists ENABLE ROW LEVEL SECURITY;

-- Credentials (issued VCs)
CREATE TABLE public.credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id UUID REFERENCES public.credential_schemas(id) ON DELETE SET NULL,
  issuer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  holder_did TEXT NOT NULL,
  holder_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  credential_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  credential_hash TEXT NOT NULL,
  prev_hash TEXT,
  blockchain_anchor TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ DEFAULT NULL,
  issuer_signature TEXT,
  signer_address TEXT,
  status_list_id UUID REFERENCES public.status_lists(id),
  status_list_index INTEGER,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;

-- Credential shares (selective disclosure / time-limited sharing)
CREATE TABLE public.credential_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID NOT NULL REFERENCES public.credentials(id) ON DELETE CASCADE,
  holder_id UUID NOT NULL,
  token TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex') UNIQUE,
  disclosed_fields JSONB DEFAULT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.credential_shares ENABLE ROW LEVEL SECURITY;

-- Verification requests
CREATE TABLE public.verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verifier_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  credential_id UUID REFERENCES public.credentials(id) ON DELETE SET NULL,
  holder_did TEXT,
  credential_type TEXT,
  purpose TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  ai_analysis JSONB,
  shared_credential_data JSONB DEFAULT NULL,
  access_expires_at TIMESTAMPTZ DEFAULT NULL,
  storage_consent BOOLEAN DEFAULT false,
  responded_at TIMESTAMPTZ DEFAULT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'info',
  read BOOLEAN NOT NULL DEFAULT false,
  credential_id UUID REFERENCES public.credentials(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Audit logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- Trusted Issuer Registry
CREATE TABLE public.trusted_issuers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_did TEXT NOT NULL UNIQUE,
  issuer_user_id UUID,
  organization_name TEXT NOT NULL,
  domain TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMPTZ,
  verified_by UUID,
  trust_level TEXT NOT NULL DEFAULT 'standard',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.trusted_issuers ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_trusted_issuers_did ON public.trusted_issuers(issuer_did);
CREATE INDEX idx_trusted_issuers_status ON public.trusted_issuers(verification_status);

-- GDPR consent tracking
CREATE TABLE public.consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  consent_type TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT true,
  purpose TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

-- Data deletion requests
CREATE TABLE public.data_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;

-- OID4VC sessions
CREATE TABLE public.oid4vc_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_type TEXT NOT NULL,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  schema_id UUID REFERENCES public.credential_schemas(id),
  credential_data JSONB DEFAULT '{}',
  pre_authorized_code TEXT UNIQUE,
  presentation_definition JSONB,
  response_data JSONB,
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.oid4vc_sessions ENABLE ROW LEVEL SECURITY;

-- ── Functions ────────────────────────────────────────────────────

-- Check roles (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Auto-create profile on signup (sets account_status to approved)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _role text;
BEGIN
  _role := NEW.raw_user_meta_data->>'role';

  -- All users are auto-approved, no admin approval needed
  INSERT INTO public.profiles (user_id, full_name, account_status)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'approved');

  IF _role IS NOT NULL AND _role IN ('issuer', 'holder', 'verifier') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, _role::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Generate DID from wallet address
CREATE OR REPLACE FUNCTION public.generate_did(_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _did TEXT;
  _wallet TEXT;
BEGIN
  SELECT wallet_address INTO _wallet FROM public.profiles WHERE user_id = _user_id;
  IF _wallet IS NULL OR _wallet = '' THEN
    RAISE EXCEPTION 'Wallet not linked. Connect your wallet before generating a DID.';
  END IF;
  _did := 'did:ethr:sepolia:' || _wallet;
  UPDATE public.profiles SET did = _did, updated_at = now() WHERE user_id = _user_id AND did IS NULL;
  RETURN _did;
END;
$$;

-- Auto-expire credentials
CREATE OR REPLACE FUNCTION public.check_credential_expiration()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at < now() AND NEW.status = 'active' THEN
    NEW.status := 'expired';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_check_credential_expiration
  BEFORE INSERT OR UPDATE ON public.credentials
  FOR EACH ROW EXECUTE FUNCTION public.check_credential_expiration();

-- Notification triggers
CREATE OR REPLACE FUNCTION public.notify_credential_issued()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.holder_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, credential_id)
    VALUES (NEW.holder_id, 'New Credential Issued',
      'A new verifiable credential has been issued to your DID and anchored on-chain.',
      'credential_issued', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_credential_issued
  AFTER INSERT ON public.credentials
  FOR EACH ROW EXECUTE FUNCTION public.notify_credential_issued();

CREATE OR REPLACE FUNCTION public.notify_credential_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status = 'revoked' AND NEW.holder_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, credential_id)
    VALUES (NEW.holder_id, 'Credential Revoked', 'One of your credentials has been revoked by the issuer.', 'credential_revoked', NEW.id);
  END IF;
  IF OLD.status = 'active' AND NEW.status = 'expired' AND NEW.holder_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, credential_id)
    VALUES (NEW.holder_id, 'Credential Expired', 'One of your credentials has expired.', 'credential_expired', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_credential_status_change
  AFTER UPDATE ON public.credentials
  FOR EACH ROW EXECUTE FUNCTION public.notify_credential_status_change();

-- ── RLS Policies ─────────────────────────────────────────────────

-- user_roles
CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own role" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- profiles
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Issuers can read all profiles" ON public.profiles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'issuer'::app_role));
CREATE POLICY "Verifiers can read all profiles" ON public.profiles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'verifier'::app_role));

-- credentials
CREATE POLICY "Holders can read own credentials" ON public.credentials FOR SELECT TO authenticated USING (holder_id = auth.uid());
CREATE POLICY "Issuers can create credentials" ON public.credentials FOR INSERT TO authenticated WITH CHECK (issuer_id = auth.uid());
CREATE POLICY "Issuers can read own issued" ON public.credentials FOR SELECT TO authenticated USING (issuer_id = auth.uid());
CREATE POLICY "Issuers can update own credentials" ON public.credentials FOR UPDATE TO authenticated USING (issuer_id = auth.uid());
CREATE POLICY "Verifiers can read credentials" ON public.credentials FOR SELECT TO authenticated USING (has_role(auth.uid(), 'verifier'::app_role));
CREATE POLICY "Read credentials via share token" ON public.credentials FOR SELECT TO anon, authenticated USING (id IN (SELECT credential_id FROM public.credential_shares WHERE expires_at > now()));

-- credential_schemas
CREATE POLICY "Anyone can read schemas" ON public.credential_schemas FOR SELECT USING (true);
CREATE POLICY "Issuers can manage schemas" ON public.credential_schemas FOR ALL TO authenticated USING (issuer_id = auth.uid()) WITH CHECK (issuer_id = auth.uid());

-- credential_shares
CREATE POLICY "Holders can manage own shares" ON public.credential_shares FOR ALL TO authenticated USING (holder_id = auth.uid()) WITH CHECK (holder_id = auth.uid());
CREATE POLICY "Public can read by token" ON public.credential_shares FOR SELECT USING (true);

-- verification_requests
CREATE POLICY "Verifiers can manage requests" ON public.verification_requests FOR ALL TO authenticated USING (verifier_id = auth.uid()) WITH CHECK (verifier_id = auth.uid());
CREATE POLICY "Holders can read own requests" ON public.verification_requests FOR SELECT TO authenticated USING (holder_did IN (SELECT did FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Holders can respond to requests" ON public.verification_requests FOR UPDATE TO authenticated USING (holder_did IN (SELECT did FROM public.profiles WHERE user_id = auth.uid())) WITH CHECK (holder_did IN (SELECT did FROM public.profiles WHERE user_id = auth.uid()));

-- notifications
CREATE POLICY "Users can read own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- audit_logs
CREATE POLICY "Users can read own audit logs" ON public.audit_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Issuers can read all audit logs" ON public.audit_logs FOR SELECT USING (has_role(auth.uid(), 'issuer'));
CREATE POLICY "Service role inserts audit logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- trusted_issuers
CREATE POLICY "Anyone can read trusted issuers" ON public.trusted_issuers FOR SELECT USING (true);
CREATE POLICY "Issuers can register themselves" ON public.trusted_issuers FOR INSERT WITH CHECK (has_role(auth.uid(), 'issuer'));
CREATE POLICY "Issuers can update own entry" ON public.trusted_issuers FOR UPDATE USING (issuer_user_id = auth.uid());

-- status_lists
CREATE POLICY "Issuers manage own status lists" ON public.status_lists FOR ALL USING (issuer_id = auth.uid()) WITH CHECK (issuer_id = auth.uid());
CREATE POLICY "Anyone can read status lists" ON public.status_lists FOR SELECT USING (true);

-- consent_records
CREATE POLICY "Users manage own consent" ON public.consent_records FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- data_deletion_requests
CREATE POLICY "Users manage own deletion requests" ON public.data_deletion_requests FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- oid4vc_sessions
CREATE POLICY "Users manage own sessions" ON public.oid4vc_sessions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Public read by code" ON public.oid4vc_sessions FOR SELECT TO anon, authenticated USING (true);

-- ── Realtime ─────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.credentials;
ALTER PUBLICATION supabase_realtime ADD TABLE public.verification_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
