-- Fix all RLS issues for portals

-- 1. credential_schemas - allow all authenticated users to read
DROP POLICY IF EXISTS "Anyone can read schemas" ON public.credential_schemas;
DROP POLICY IF EXISTS "Issuers can manage schemas" ON public.credential_schemas;
CREATE POLICY "All can read credential_schemas" ON public.credential_schemas
FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners can manage credential_schemas" ON public.credential_schemas
FOR ALL TO authenticated USING (issuer_id = auth.uid()) WITH CHECK (issuer_id = auth.uid());

-- 2. credentials - allow authenticated users to read
DROP POLICY IF EXISTS "Holders can read own credentials" ON public.credentials;
DROP POLICY IF EXISTS "Issuers can create credentials" ON public.credentials;
DROP POLICY IF EXISTS "Issuers can read own issued" ON public.credentials;
DROP POLICY IF EXISTS "Issuers can update own credentials" ON public.credentials;
DROP POLICY IF EXISTS "Verifiers can read credentials" ON public.credentials;
DROP POLICY IF EXISTS "Read credentials via share token" ON public.credentials;
CREATE POLICY "All can read credentials" ON public.credentials
FOR SELECT TO authenticated USING (true);
CREATE POLICY "Issuers can manage credentials" ON public.credentials
FOR ALL TO authenticated USING (issuer_id = auth.uid()) WITH CHECK (issuer_id = auth.uid());

-- 3. profiles - fix for all access
DROP POLICY IF EXISTS "All authenticated can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "All can read profiles" ON public.profiles
FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 4. user_roles - fix for all access
DROP POLICY IF EXISTS "All can read roles" ON public.user_roles;
CREATE POLICY "All can read roles" ON public.user_roles
FOR SELECT TO authenticated USING (true);

-- 5. audit_logs - fix for all access
DROP POLICY IF EXISTS "All can read audit logs" ON public.audit_logs;
CREATE POLICY "All can read audit logs" ON public.audit_logs
FOR SELECT TO authenticated USING (true);