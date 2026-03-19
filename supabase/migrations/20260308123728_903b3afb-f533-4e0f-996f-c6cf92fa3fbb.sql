
-- Fix ALL RLS policies: change from RESTRICTIVE to PERMISSIVE
-- Drop all existing restrictive policies and recreate as permissive

-- ========== user_roles ==========
DROP POLICY IF EXISTS "Users can read own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;

CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own role" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ========== profiles ==========
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Issuers can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Verifiers can read all profiles" ON public.profiles;

CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Issuers can read all profiles" ON public.profiles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'issuer'::app_role));
CREATE POLICY "Verifiers can read all profiles" ON public.profiles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'verifier'::app_role));

-- ========== credentials ==========
DROP POLICY IF EXISTS "Holders can read own credentials" ON public.credentials;
DROP POLICY IF EXISTS "Issuers can create credentials" ON public.credentials;
DROP POLICY IF EXISTS "Issuers can read own issued" ON public.credentials;
DROP POLICY IF EXISTS "Issuers can update own credentials" ON public.credentials;
DROP POLICY IF EXISTS "Verifiers can read credentials" ON public.credentials;
DROP POLICY IF EXISTS "Read credentials via share token" ON public.credentials;

CREATE POLICY "Holders can read own credentials" ON public.credentials FOR SELECT TO authenticated USING (holder_id = auth.uid());
CREATE POLICY "Issuers can create credentials" ON public.credentials FOR INSERT TO authenticated WITH CHECK (issuer_id = auth.uid());
CREATE POLICY "Issuers can read own issued" ON public.credentials FOR SELECT TO authenticated USING (issuer_id = auth.uid());
CREATE POLICY "Issuers can update own credentials" ON public.credentials FOR UPDATE TO authenticated USING (issuer_id = auth.uid());
CREATE POLICY "Verifiers can read credentials" ON public.credentials FOR SELECT TO authenticated USING (has_role(auth.uid(), 'verifier'::app_role));
CREATE POLICY "Read credentials via share token" ON public.credentials FOR SELECT TO anon, authenticated USING (id IN (SELECT credential_id FROM public.credential_shares WHERE expires_at > now()));

-- ========== credential_schemas ==========
DROP POLICY IF EXISTS "Anyone can read schemas" ON public.credential_schemas;
DROP POLICY IF EXISTS "Issuers can manage schemas" ON public.credential_schemas;

CREATE POLICY "Anyone can read schemas" ON public.credential_schemas FOR SELECT USING (true);
CREATE POLICY "Issuers can manage schemas" ON public.credential_schemas FOR ALL TO authenticated USING (issuer_id = auth.uid()) WITH CHECK (issuer_id = auth.uid());

-- ========== credential_shares ==========
DROP POLICY IF EXISTS "Holders can manage own shares" ON public.credential_shares;
DROP POLICY IF EXISTS "Holders can delete own shares" ON public.credential_shares;
DROP POLICY IF EXISTS "Public can read by token" ON public.credential_shares;

CREATE POLICY "Holders can manage own shares" ON public.credential_shares FOR ALL TO authenticated USING (holder_id = auth.uid()) WITH CHECK (holder_id = auth.uid());
CREATE POLICY "Public can read by token" ON public.credential_shares FOR SELECT USING (true);

-- ========== notifications ==========
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;

CREATE POLICY "Users can read own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ========== verification_requests ==========
DROP POLICY IF EXISTS "Verifiers can manage requests" ON public.verification_requests;
DROP POLICY IF EXISTS "Holders can read own requests" ON public.verification_requests;

CREATE POLICY "Verifiers can manage requests" ON public.verification_requests FOR ALL TO authenticated USING (verifier_id = auth.uid()) WITH CHECK (verifier_id = auth.uid());
CREATE POLICY "Holders can read own requests" ON public.verification_requests FOR SELECT TO authenticated USING (holder_did IN (SELECT did FROM public.profiles WHERE user_id = auth.uid()));
