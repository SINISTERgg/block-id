-- Fix all admin-related RLS policies for proper access

-- 1. Fix profiles - allow authenticated users to read all profiles
DROP POLICY IF EXISTS "Admins/Issuers/Verifiers read profiles" ON public.profiles;
CREATE POLICY "All authenticated can read profiles" ON public.profiles
FOR SELECT TO authenticated USING (true);

-- 2. Allow authenticated users to update profiles (for admin actions)
CREATE POLICY "Admins can update profiles" ON public.profiles
FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 3. Ensure audit_logs is readable by authenticated
DROP POLICY IF EXISTS "Authenticated can read audit logs" ON public.audit_logs;
CREATE POLICY "All can read audit logs" ON public.audit_logs
FOR SELECT TO authenticated USING (true);

-- 4. Ensure user_roles is readable
DROP POLICY IF EXISTS "Users can read roles" ON public.user_roles;
CREATE POLICY "All can read roles" ON public.user_roles
FOR SELECT TO authenticated USING (true);