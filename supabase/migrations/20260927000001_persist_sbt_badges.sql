-- ============================================================
-- Persist soulbound (SBT) badge issuance on the credential row
--
-- Problem: `mintSbtForCredential` returns a tokenId, but nothing
-- ever wrote it to the database. The holder portal therefore had
-- no way to know which credentials *should* have a badge, and
-- every downstream consumer of SBT state read a column that was
-- structurally always NULL:
--
--   · HolderPortal → BadgesView  (on-chain scan by wallet only)
--   · ComplianceView  sbt_badged  → always 0
--   · VerificationResultView sbtBadge → always null
--   · policy.require_sbt_badge      → could never pass
--
-- Fix: record the badge on `credentials` at mint time. The row is
-- the join between "credential exists" and "badge exists on chain";
-- the chain remains the source of truth for validity.
--
-- Every statement is idempotent.
-- ============================================================

-- ── 1. Badge columns on credentials ─────────────────────────────────────────
alter table public.credentials
  add column if not exists sbt_token_id      numeric,
  add column if not exists sbt_tx_hash       text,
  add column if not exists sbt_holder_address text,
  add column if not exists sbt_minted_at     timestamptz,
  -- Durable record that the issuer asked for a badge at issuance time.
  -- Without this, "badge was requested but never landed" is indistinguishable
  -- from "no badge was ever wanted", and the holder portal shows every
  -- credential as a pending badge.
  add column if not exists sbt_requested     boolean not null default false,
  add column if not exists sbt_status        text
    check (sbt_status is null or sbt_status in ('minted', 'revoked', 'burned', 'failed'));

comment on column public.credentials.sbt_requested is
  'Issuer requested a soulbound badge for this credential at issuance';
comment on column public.credentials.sbt_token_id is
  'SoulboundCredential tokenId for this credential (null = no badge minted)';
comment on column public.credentials.sbt_holder_address is
  'On-chain address that holds the badge — must match the holder DID address';
comment on column public.credentials.sbt_status is
  'Last known badge state: minted | revoked | burned | failed';

-- Partial index: the holder portal filters on "has a badge".
create index if not exists idx_credentials_sbt_token_id
  on public.credentials (sbt_token_id)
  where sbt_token_id is not null;

create index if not exists idx_credentials_holder_sbt
  on public.credentials (holder_id, sbt_minted_at desc nulls last);

-- ── 2. Record a badge mint (idempotent) ─────────────────────────────────────
-- Called by the `record-sbt` edge function after the mint tx confirms.
-- Security definer: the caller is an edge function holding the issuer's
-- JWT, but RLS on `credentials` would otherwise block the update because
-- the authenticated user is the issuer rather than the row's holder.
create or replace function public.record_sbt_mint(
  p_credential_id uuid,
  p_token_id      numeric,
  p_tx_hash       text,
  p_holder_address text,
  p_status        text default 'minted'
)
returns public.credentials
language plpgsql
security definer
set search_path = public
as $$
declare
  row_out public.credentials;
  caller_role text;
begin
  if p_credential_id is null then
    raise exception 'p_credential_id is required';
  end if;
  if p_token_id is not null and (p_token_id < 1 or p_token_id <> trunc(p_token_id)) then
    raise exception 'p_token_id must be a positive integer, got %', p_token_id;
  end if;
  if p_status is not null and p_status not in ('minted', 'revoked', 'burned', 'failed') then
    raise exception 'invalid p_status: %', p_status;
  end if;

  -- Only allow service role callers (Edge Functions) to mutate badge records.
  select coalesce(current_setting('request.jwt.role', true), current_setting('jwt.claims.role', true))
    into caller_role;
  if caller_role is not distinct from 'authenticated' then
    raise exception 'access denied: function intended for service role only';
  end if;

  update public.credentials
     set sbt_token_id       = p_token_id,
         sbt_tx_hash        = p_tx_hash,
         sbt_holder_address = lower(p_holder_address),
         sbt_status         = p_status,
         sbt_minted_at      = coalesce(public.credentials.sbt_minted_at, now())
   where id = p_credential_id
   returning * into row_out;

  if not found then
    raise exception 'credential % not found', p_credential_id;
  end if;

  return row_out;
end;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC on new functions by default. These are
-- SECURITY DEFINER, so that default would let an anon-key caller write badge
-- rows for arbitrary credentials. Close it, then grant only to service_role.
revoke execute on function public.record_sbt_mint(uuid, numeric, text, text, text) from public;
grant execute on function public.record_sbt_mint(uuid, numeric, text, text, text) to service_role;

-- ── 3. Mark a badge revoked/burned without clearing its token id ────────────
-- Keeps the audit trail: the token id stays so verifiers can still resolve
-- the token on-chain, while `sbt_status` reflects the current state.
create or replace function public.record_sbt_state(
  p_credential_id uuid,
  p_status        text
)
returns public.credentials
language plpgsql
security definer
set search_path = public
as $$
declare
  row_out public.credentials;
begin
  if p_status not in ('revoked', 'burned', 'failed') then
    raise exception 'p_status must be revoked, burned or failed, got %', p_status;
  end if;

  update public.credentials
     set sbt_status = p_status
   where id = p_credential_id
     and sbt_token_id is not null
   returning * into row_out;

  if not found then
    raise exception 'credential % has no recorded badge', p_credential_id;
  end if;

  return row_out;
end;
$$;

revoke execute on function public.record_sbt_state(uuid, text) from public;
grant execute on function public.record_sbt_state(uuid, text) to service_role;

-- ── 4. Holder badge feed ────────────────────────────────────────────────────
-- Single query for the holder portal: every credential this holder owns that
-- has badge state, so BadgesView can render on-chain SBTs *and* flag
-- credentials whose badge was requested but never landed on chain.
--
-- SECURITY DEFINER (so it works regardless of the table's RLS) combined with an
-- explicit caller check: a signed-in caller may only ever read their own row,
-- otherwise they could pass someone else's uuid and read their badge feed.
-- Service-role callers (Edge Functions, reconciliation) may read any holder.
create or replace function public.get_holder_badges(p_holder_id uuid)
returns table (
  credential_id   uuid,
  credential_hash text,
  status          text,
  issued_at       timestamptz,
  expires_at      timestamptz,
  schema_name     text,
  credential_type text,
  sbt_token_id    numeric,
  sbt_tx_hash     text,
  sbt_holder_address text,
  sbt_minted_at   timestamptz,
  sbt_requested   boolean,
  sbt_status      text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  if p_holder_id is null then
    raise exception 'p_holder_id is required';
  end if;

  select coalesce(current_setting('request.jwt.role', true), current_setting('jwt.claims.role', true))
    into caller_role;

  if caller_role is distinct from 'service_role' and p_holder_id <> auth.uid() then
    raise exception 'access denied: can only read your own badges';
  end if;

  return query
    select
      c.id,
      c.credential_hash,
      c.status,
      c.issued_at,
      c.expires_at,
      s.name,
      s.credential_type,
      c.sbt_token_id,
      c.sbt_tx_hash,
      c.sbt_holder_address,
      c.sbt_minted_at,
      c.sbt_requested,
      c.sbt_status
    from public.credentials c
    left join public.credential_schemas s on s.id = c.schema_id
    where c.holder_id = p_holder_id
      and c.revoked_at is null
      and (c.sbt_requested or c.sbt_token_id is not null or c.sbt_status is not null)
    order by c.sbt_minted_at desc nulls last, c.issued_at desc;
end;
$$;

revoke execute on function public.get_holder_badges(uuid) from public;
grant execute on function public.get_holder_badges(uuid) to authenticated, service_role;

-- ── 5. Backfill: recover token ids for badges that did land on chain ─────────
-- The mint bug meant no token id was ever stored, but any credential that was
-- successfully anchored and later had its badge minted can be recovered from
-- the chain. This is intentionally NOT done here (PL/pgSQL cannot call an
-- EVM node); run the reconciliation from the app instead:
--
--   node scripts/reconcile-sbt.js --network sepolia
--
-- which calls `reconcileBadge` per credential and backfills via record_sbt_mint.

notify pgrst, 'reload schema';
