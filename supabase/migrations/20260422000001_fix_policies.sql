-- Fix RLS policies for credential_schemas

-- First, ensure RLS is enabled
ALTER TABLE IF EXISTS public.credential_schemas ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can read schemas" ON public.credential_schemas;
DROP POLICY IF EXISTS "Issuers can manage schemas" ON public.credential_schemas;

-- Allow anonymous users to read schemas
CREATE POLICY "Anyone can read schemas" ON public.credential_schemas 
FOR SELECT USING (true);

-- Allow owners to manage their own schemas
CREATE POLICY "Issuers can manage schemas" ON public.credential_schemas 
FOR ALL TO authenticated USING (issuer_id = auth.uid()) WITH CHECK (issuer_id = auth.uid());

-- Also add expires_at to credentials if missing
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'credentials' AND column_name = 'expires_at') THEN
    ALTER TABLE public.credentials ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
END $$;