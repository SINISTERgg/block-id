-- ============================================================
-- Verifier portal intelligence
--
-- Adds the derived-verdict columns that the verifier portal now
-- persists (ZKP outcome, trust score/tier, anomaly findings,
-- biometric + SBT + policy evidence) and the two new verifier
-- owned tables: declarative verification policies and a
-- per-verifier holder blocklist.
--
-- Every DDL statement is idempotent so this can be re-applied to
-- a database whose schema cache has drifted.
-- ============================================================

-- ── 1. Derived intelligence columns on verification_requests ────────────────
alter table public.verification_requests
  add column if not exists zkp_circuit         text,
  add column if not exists zkp_proof_valid     boolean,
  add column if not exists zkp_on_chain_valid  boolean,
  add column if not exists zkp_nullifier       text,
  add column if not exists trust_score         numeric(5, 2)
    check (trust_score is null or (trust_score >= 0 and trust_score <= 100)),
  add column if not exists trust_tier          text
    check (trust_tier is null or trust_tier in ('platinum', 'gold', 'silver', 'bronze', 'untrusted')),
  add column if not exists anomaly_risk        numeric(5, 2)
    check (anomaly_risk is null or (anomaly_risk >= 0 and anomaly_risk <= 100)),
  add column if not exists anomaly_findings    jsonb,
  add column if not exists biometric_verified  boolean,
  add column if not exists sbt_token_id        numeric,
  add column if not exists policy_id           uuid;

create index if not exists idx_verification_requests_trust_tier
  on public.verification_requests (trust_tier);

create index if not exists idx_verification_requests_anomaly_risk
  on public.verification_requests (anomaly_risk desc);

create index if not exists idx_verification_requests_zkp_circuit
  on public.verification_requests (zkp_circuit);

create index if not exists idx_verification_requests_verified_at
  on public.verification_requests (verified_at desc);

-- ── 2. Declarative verification policies ────────────────────────────────────
create table if not exists public.verification_policies (
  id uuid primary key default gen_random_uuid(),
  verifier_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  policy_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  constraint verification_policies_name_len check (char_length(name) between 1 and 120)
);

alter table public.verification_policies enable row level security;

drop policy if exists "Verifiers can manage own policies" on public.verification_policies;
create policy "Verifiers can manage own policies"
  on public.verification_policies
  for all
  to authenticated
  using (verifier_id = auth.uid())
  with check (verifier_id = auth.uid());

create index if not exists idx_verification_policies_verifier
  on public.verification_policies (verifier_id, is_active);

-- ── 3. Per-verifier holder blocklist ───────────────────────────────────────
create table if not exists public.verifier_blocklist (
  id uuid primary key default gen_random_uuid(),
  verifier_id uuid not null references auth.users(id) on delete cascade,
  holder_did text not null,
  reason text,
  blocked_at timestamptz not null default now(),
  constraint verifier_blocklist_unique_did unique (verifier_id, holder_did)
);

alter table public.verifier_blocklist enable row level security;

drop policy if exists "Verifiers can manage own blocklist" on public.verifier_blocklist;
create policy "Verifiers can manage own blocklist"
  on public.verifier_blocklist
  for all
  to authenticated
  using (verifier_id = auth.uid())
  with check (verifier_id = auth.uid());

create index if not exists idx_verifier_blocklist_verifier
  on public.verifier_blocklist (verifier_id, blocked_at desc);

-- ── 4. Link completed requests back to the policy that judged them ─────────
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'verification_requests_policy_id_fkey'
  ) then
    alter table public.verification_requests
      add constraint verification_requests_policy_id_fkey
      foreign key (policy_id) references public.verification_policies(id) on delete set null;
  end if;
end;
$$;

-- ── 5. Force PostgREST to pick up the new tables and columns ───────────────
notify pgrst, 'reload schema';
