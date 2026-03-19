
ALTER TABLE public.credentials ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone DEFAULT NULL;

-- Create a function to check and expire credentials
CREATE OR REPLACE FUNCTION public.check_credential_expiration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at < now() AND NEW.status = 'active' THEN
    NEW.status := 'expired';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_check_credential_expiration
  BEFORE INSERT OR UPDATE ON public.credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.check_credential_expiration();
