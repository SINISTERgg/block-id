-- Complete RLS fix for all tables

-- 1. audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Auth inserts audit logs" ON public.audit_logs;
CREATE POLICY "All can read audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth inserts audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- 2. credential_schemas
ALTER TABLE public.credential_schemas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read credential_schemas" ON public.credential_schemas;
DROP POLICY IF EXISTS "Owners can manage credential_schemas" ON public.credential_schemas;
CREATE POLICY "All can read credential_schemas" ON public.credential_schemas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners can manage credential_schemas" ON public.credential_schemas FOR ALL TO authenticated USING (issuer_id = auth.uid()) WITH CHECK (issuer_id = auth.uid());

-- 3. credential_shares
ALTER TABLE public.credential_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Holders manage shares" ON public.credential_shares;
DROP POLICY IF EXISTS "Public read shares" ON public.credential_shares;
CREATE POLICY "All can read credential_shares" ON public.credential_shares FOR SELECT TO authenticated USING (true);
CREATE POLICY "Holders manage shares" ON public.credential_shares FOR ALL TO authenticated USING (holder_id = auth.uid()) WITH CHECK (holder_id = auth.uid());

-- 4. credentials
ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read credentials" ON public.credentials;
DROP POLICY IF EXISTS "Holders see own credentials" ON public.credentials;
DROP POLICY IF EXISTS "Issuers can manage credentials" ON public.credentials;
DROP POLICY IF EXISTS "Issuers manage own issued" ON public.credentials;
DROP POLICY IF EXISTS "Read via share token" ON public.credentials;
CREATE POLICY "All can read credentials" ON public.credentials FOR SELECT TO authenticated USING (true);
CREATE POLICY "Issuers can manage credentials" ON public.credentials FOR ALL TO authenticated USING (issuer_id = auth.uid()) WITH CHECK (issuer_id = auth.uid());

-- 5. notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can manage notifications" ON public.notifications;
CREATE POLICY "All can read notifications" ON public.notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage notifications" ON public.notifications FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 6. oid4vc_sessions (uses user_id)
ALTER TABLE public.oid4vc_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read oid4vc_sessions" ON public.oid4vc_sessions;
DROP POLICY IF EXISTS "Users can manage oid4vc_sessions" ON public.oid4vc_sessions;
CREATE POLICY "All can read oid4vc_sessions" ON public.oid4vc_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners can manage oid4vc_sessions" ON public.oid4vc_sessions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 7. profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "All can read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);

-- 8. trusted_issuers
ALTER TABLE public.trusted_issuers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read trusted_issuers" ON public.trusted_issuers;
CREATE POLICY "All can read trusted_issuers" ON public.trusted_issuers FOR SELECT TO authenticated USING (true);

-- 9. user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users and admins can read roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;
CREATE POLICY "All can read roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage own role" ON public.user_roles FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 10. verification_requests
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read verification_requests" ON public.verification_requests;
DROP POLICY IF EXISTS "Users can manage verification_requests" ON public.verification_requests;
CREATE POLICY "All can read verification_requests" ON public.verification_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage verification_requests" ON public.verification_requests FOR ALL TO authenticated USING (verifier_id = auth.uid()) WITH CHECK (verifier_id = auth.uid());