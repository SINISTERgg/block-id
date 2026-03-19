
CREATE OR REPLACE FUNCTION public.generate_did(_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _did TEXT;
BEGIN
  _did := 'did:decentraid:' || encode(extensions.gen_random_bytes(16), 'hex');
  UPDATE public.profiles SET did = _did, updated_at = now() WHERE user_id = _user_id AND did IS NULL;
  RETURN _did;
END;
$function$;
