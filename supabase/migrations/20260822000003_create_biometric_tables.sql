-- Phase 8 — Biometric verification pipeline
-- Raw images are NEVER stored: only hashes, scores, and outcomes.

-- ── Liveness/verification challenges (single-use, short-lived) ──────────────
create table if not exists public.biometric_challenges (
  id uuid primary key default gen_random_uuid(),
  nonce text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  used_at timestamptz
);

alter table public.biometric_challenges enable row level security;

-- No client policies: challenges are created/consumed exclusively by the
-- biometric-verify edge function using the service role key.

create index if not exists idx_biometric_challenges_nonce on public.biometric_challenges (nonce);

-- ── Verification results (hashes + scores only) ─────────────────────────────
create table if not exists public.biometric_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  liveness_score numeric(5, 2) not null check (liveness_score >= 0 and liveness_score <= 100),
  face_match_score numeric(5, 2) not null check (face_match_score >= 0 and face_match_score <= 100),
  passed boolean not null,
  subject_hash text not null,
  proof_hash text not null unique,
  anchored boolean not null default false,
  anchor_tx_hash text,
  provider text not null default 'mock',
  created_at timestamptz not null default now()
);

alter table public.biometric_verifications enable row level security;

-- Holders may read their own verification history; writes go through the
-- service role only.
create policy "Holders can view own biometric verifications"
  on public.biometric_verifications
  for select
  using (auth.uid() = user_id);

create index if not exists idx_biometric_verifications_user on public.biometric_verifications (user_id);

-- ── Housekeeping ────────────────────────────────────────────────────────────
create or replace function public.prune_expired_biometric_challenges()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.biometric_challenges where expires_at < now() - interval '1 hour';
end;
$$;
