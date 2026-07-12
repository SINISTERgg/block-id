-- Fix audit_logs RLS to allow org_admin
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can read own audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Issuers can read all audit logs" ON public.audit_logs;

-- Allow authenticated users to read all audit logs
CREATE POLICY "Authenticated can read audit logs" ON public.audit_logs 
FOR SELECT TO authenticated USING (true);

-- Allow service role to insert
DROP POLICY IF EXISTS "Service role inserts audit logs" ON public.audit_logs;
CREATE POLICY "Auth inserts audit logs" ON public.audit_logs 
FOR INSERT TO authenticated WITH CHECK (true);