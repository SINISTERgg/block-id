-- Allow holders to update (accept/decline) verification requests addressed to their DID.
-- They can only change the status column; the USING clause ensures they can only
-- update rows where the holder_did matches their profile DID.

CREATE POLICY "Holders can respond to requests"
  ON public.verification_requests
  FOR UPDATE
  TO authenticated
  USING (
    holder_did IN (
      SELECT did FROM public.profiles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    holder_did IN (
      SELECT did FROM public.profiles WHERE user_id = auth.uid()
    )
  );
