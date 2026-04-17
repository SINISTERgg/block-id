-- ============================================================
-- Migration: DID generation only after wallet is linked
-- The DID now derives from the wallet address (did:ethr:sepolia:0x...)
-- instead of being auto-generated with random bytes on signup.
-- ============================================================

-- 1. Remove auto-DID generation from the signup trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _role text;
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  _role := NEW.raw_user_meta_data->>'role';
  IF _role IS NOT NULL AND _role IN ('issuer', 'holder', 'verifier') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, _role::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  -- DID is NO LONGER auto-generated here.
  -- Holders must connect a wallet first; the frontend calls generate_did after linking.

  RETURN NEW;
END;
$$;

-- 2. Update generate_did to derive from wallet address
CREATE OR REPLACE FUNCTION public.generate_did(_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _did TEXT;
  _wallet TEXT;
BEGIN
  -- Look up the wallet address from the profile
  SELECT wallet_address INTO _wallet
    FROM public.profiles
   WHERE user_id = _user_id;

  IF _wallet IS NULL OR _wallet = '' THEN
    RAISE EXCEPTION 'Wallet not linked. Connect your wallet before generating a DID.';
  END IF;

  -- Build a deterministic DID from the wallet address
  _did := 'did:ethr:sepolia:' || _wallet;

  UPDATE public.profiles
     SET did = _did, updated_at = now()
   WHERE user_id = _user_id
     AND did IS NULL;

  RETURN _did;
END;
$function$;
