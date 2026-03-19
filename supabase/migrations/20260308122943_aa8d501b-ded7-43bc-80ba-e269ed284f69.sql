
CREATE POLICY "Holders can delete own shares"
  ON public.credential_shares
  FOR DELETE
  TO authenticated
  USING (holder_id = auth.uid());
