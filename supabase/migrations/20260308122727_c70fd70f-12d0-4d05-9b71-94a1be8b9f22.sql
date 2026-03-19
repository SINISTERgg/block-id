
CREATE POLICY "Read credentials via share token"
  ON public.credentials
  FOR SELECT
  TO anon, authenticated
  USING (
    id IN (
      SELECT credential_id FROM public.credential_shares
      WHERE expires_at > now()
    )
  );
