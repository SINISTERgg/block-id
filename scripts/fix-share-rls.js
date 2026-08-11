/**
 * One-time script to fix RLS policies for credential_shares.
 * Run this from the browser console or as a Node.js script with the service role key.
 * 
 * The issue: credential_shares table only allows 'authenticated' users to SELECT,
 * but the /shared/:token page is public. We need to allow 'anon' too.
 */

// Run this SQL in your Supabase SQL Editor:
const SQL = `
-- Drop the restrictive policy
DROP POLICY IF EXISTS "All can read credential_shares" ON public.credential_shares;

-- Allow both anon and authenticated users to read shares (needed for public share links)
CREATE POLICY "Anyone can read credential_shares by token"
  ON public.credential_shares
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Fix credentials table too - allow anon to read via share token
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
`;

console.log("Run this SQL in your Supabase SQL Editor at:");
console.log("https://supabase.com/dashboard/project/gqsiirtclckqnftcglaq/sql");
console.log("");
console.log(SQL);
