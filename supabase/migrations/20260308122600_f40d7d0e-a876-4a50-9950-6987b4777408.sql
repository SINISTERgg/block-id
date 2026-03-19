
CREATE TABLE public.credential_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id uuid NOT NULL REFERENCES public.credentials(id) ON DELETE CASCADE,
  holder_id uuid NOT NULL,
  token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(token)
);

ALTER TABLE public.credential_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Holders can manage own shares"
  ON public.credential_shares
  FOR ALL
  TO authenticated
  USING (holder_id = auth.uid())
  WITH CHECK (holder_id = auth.uid());

CREATE POLICY "Public can read by token"
  ON public.credential_shares
  FOR SELECT
  TO anon, authenticated
  USING (true);
