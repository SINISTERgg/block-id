CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Role enum
CREATE TYPE public.app_role AS ENUM ('issuer', 'holder', 'verifier');

-- User roles table (separate from profiles per security guidelines)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  organization TEXT DEFAULT '',
  did TEXT UNIQUE,
  biometric_registered BOOLEAN DEFAULT false,
  face_registered BOOLEAN DEFAULT false,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.credential_schemas ENABLE ROW LEVEL SECURITY;

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
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;

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
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Generate DID for user
CREATE OR REPLACE FUNCTION public.generate_did(_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _did TEXT;
BEGIN
  _did := 'did:decentraid:' || encode(extensions.gen_random_bytes(16), 'hex');
  UPDATE public.profiles SET did = _did, updated_at = now() WHERE user_id = _user_id AND did IS NULL;
  RETURN _did;
END;
$$;

-- RLS Policies

-- user_roles: users can read their own roles
CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Allow inserting own role during signup flow
CREATE POLICY "Users can insert own role" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- profiles: users can read/update own profile, issuers/verifiers can read any profile
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Issuers can read all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'issuer'));
CREATE POLICY "Verifiers can read all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'verifier'));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- credential_schemas: issuers manage, others read
CREATE POLICY "Issuers can manage schemas" ON public.credential_schemas FOR ALL TO authenticated USING (issuer_id = auth.uid()) WITH CHECK (issuer_id = auth.uid());
CREATE POLICY "Anyone can read schemas" ON public.credential_schemas FOR SELECT TO authenticated USING (true);

-- credentials: issuers create, holders see their own, verifiers can read
CREATE POLICY "Issuers can create credentials" ON public.credentials FOR INSERT TO authenticated WITH CHECK (issuer_id = auth.uid());
CREATE POLICY "Issuers can read own issued" ON public.credentials FOR SELECT TO authenticated USING (issuer_id = auth.uid());
CREATE POLICY "Holders can read own credentials" ON public.credentials FOR SELECT TO authenticated USING (holder_id = auth.uid());
CREATE POLICY "Verifiers can read credentials" ON public.credentials FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'verifier'));
CREATE POLICY "Issuers can update own credentials" ON public.credentials FOR UPDATE TO authenticated USING (issuer_id = auth.uid());

-- verification_requests: verifiers manage, holders see requests for them
CREATE POLICY "Verifiers can manage requests" ON public.verification_requests FOR ALL TO authenticated USING (verifier_id = auth.uid()) WITH CHECK (verifier_id = auth.uid());
CREATE POLICY "Holders can read own requests" ON public.verification_requests FOR SELECT TO authenticated
  USING (holder_did IN (SELECT did FROM public.profiles WHERE user_id = auth.uid()));

-- Enable realtime for credentials and verification_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.credentials;
ALTER PUBLICATION supabase_realtime ADD TABLE public.verification_requests;
