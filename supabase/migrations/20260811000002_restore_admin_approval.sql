-- ============================================================
-- Restore admin approval flow
-- Reverts handle_new_user() so that issuer/verifier signups are
-- created as 'pending' and must be approved by an admin before
-- they can access the portal. This was removed in a previous
-- change which auto-approved every user.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _role text;
  _status text;
BEGIN
  _role := NEW.raw_user_meta_data->>'role';

  -- Issuers and verifiers require admin approval; holders are auto-approved
  IF _role IN ('issuer', 'verifier') THEN
    _status := 'pending';
  ELSE
    _status := 'approved';
  END IF;

  INSERT INTO public.profiles (user_id, full_name, account_status)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), _status);

  IF _role IS NOT NULL AND _role IN ('issuer', 'holder', 'verifier') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, _role::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
