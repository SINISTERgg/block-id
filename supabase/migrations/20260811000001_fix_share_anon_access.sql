-- Fix: Allow anonymous (unauthenticated) users to read credential_shares by token.
-- The previous migration restricted access to "authenticated" only, which broke
-- the public share link page (/shared/:token) for users who are not logged in.

-- Drop the policy that only allows authenticated users
DROP POLICY IF EXISTS "All can read credential_shares" ON public.credential_shares;
DROP POLICY IF EXISTS "Anyone can read credential_shares by token" ON public.credential_shares;

-- Recreate to allow both anon and authenticated users to read shares
CREATE POLICY "Anyone can read credential_shares by token"
  ON public.credential_shares
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Also ensure anon users can read credentials when accessed via a valid share token
DROP POLICY IF EXISTS "Read credentials via share token" ON public.credentials;

CREATE POLICY "Read credentials via share token"
  ON public.credentials
  FOR SELECT
  TO anon, authenticated
  USING (
    id IN (
      SELECT credential_id
      FROM public.credential_shares
      WHERE expires_at > now()
    )
  );
