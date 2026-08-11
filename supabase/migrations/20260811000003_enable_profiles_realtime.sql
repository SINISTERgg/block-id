-- Fix: Enable Realtime on the profiles table so UPDATE events
-- broadcast the full new row (required for status-change detection).
--
-- Without REPLICA IDENTITY FULL, Supabase Realtime UPDATE events
-- only include the primary key — payload.new.account_status is NULL,
-- so PendingApproval.tsx never detects the approval.

ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- Add profiles to the supabase_realtime publication (safe — no-ops if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;
