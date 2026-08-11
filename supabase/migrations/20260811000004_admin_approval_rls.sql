-- ============================================================
-- Allow org_admin to approve/reject accounts
-- Admin approval writes were silently dropped (0 rows affected)
-- because RLS only let a user update their own profile / issuer
-- entry. This grants org_admin UPDATE on profiles and
-- trusted_issuers so the admin portal can persist approvals.
-- ============================================================

-- profiles: org_admin may update any profile
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles" ON public.profiles
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'org_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'org_admin'::app_role));

-- trusted_issuers: org_admin may update any entry
DROP POLICY IF EXISTS "Admins can update trusted_issuers" ON public.trusted_issuers;
CREATE POLICY "Admins can update trusted_issuers" ON public.trusted_issuers
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'org_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'org_admin'::app_role));
