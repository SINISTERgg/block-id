-- ============================================================
-- C2: Remove self-service role escalation in user_roles
--
-- Problem: `"Users can manage own role"` policy was
-- `FOR ALL TO authenticated USING (user_id = auth.uid()) WITH
-- CHECK (user_id = auth.uid())` — any user could INSERT a row
-- for themselves with role='org_admin', bypassing every
-- admin-gated policy.
--
-- Fix:
--   • Drop the per-user FOR ALL policy entirely (end users never
--     need to write their own role — handle_new_user() trigger,
--     siwe-auth and admin-users edge functions write roles with
--     the service role / SECURITY DEFINER).
--   • Keep the SELECT-visible policy (client reads roles).
--   • Add admin_manage_role() — a SECURITY DEFINER helper gated
--     on has_role(auth.uid(),'org_admin') for admin-managed
--     grant/revoke, if the admin portal ever needs it.
--   • Role VALUES are already constrained by the `app_role` enum
--     column type, so no extra CHECK constraint is needed.
-- ============================================================

-- 1. Kill the escalation vector
DROP POLICY IF EXISTS "Users can manage own role" ON public.user_roles;

-- 2. Keep reads working for the app (roles are read client-side)
--    (policy already exists: "All can read roles" FOR SELECT TO authenticated)

-- 3. Admin-managed role writes (SECURITY DEFINER, org_admin-gated)
CREATE OR REPLACE FUNCTION public.admin_manage_role(
  p_user_id UUID,
  p_role app_role,
  p_action TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'org_admin'::app_role) THEN
    RAISE EXCEPTION 'Only org_admin can manage roles';
  END IF;

  IF lower(p_action) = 'grant' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, p_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF lower(p_action) = 'revoke' THEN
    DELETE FROM public.user_roles
    WHERE user_id = p_user_id AND role = p_role;
  ELSE
    RAISE EXCEPTION 'Unknown action: %', p_action;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_manage_role(UUID, app_role, TEXT)
  TO authenticated;