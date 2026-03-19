
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'info',
  read boolean NOT NULL DEFAULT false,
  credential_id uuid REFERENCES public.credentials(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Function to create notification when credential is inserted
CREATE OR REPLACE FUNCTION public.notify_credential_issued()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.holder_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, credential_id)
    VALUES (
      NEW.holder_id,
      'New Credential Issued',
      'A new verifiable credential has been issued to your DID and anchored on-chain.',
      'credential_issued',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_credential_issued
  AFTER INSERT ON public.credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_credential_issued();

-- Function to notify on credential status change (revoked/expired)
CREATE OR REPLACE FUNCTION public.notify_credential_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status = 'revoked' AND NEW.holder_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, credential_id)
    VALUES (
      NEW.holder_id,
      'Credential Revoked',
      'One of your credentials has been revoked by the issuer.',
      'credential_revoked',
      NEW.id
    );
  END IF;
  IF OLD.status = 'active' AND NEW.status = 'expired' AND NEW.holder_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, credential_id)
    VALUES (
      NEW.holder_id,
      'Credential Expired',
      'One of your credentials has expired.',
      'credential_expired',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_credential_status_change
  AFTER UPDATE ON public.credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_credential_status_change();
