-- ============================================================
-- Canonical AI analysis (v2) + LLM observability
--
-- Two jobs:
--
--   1. Make the three historical writers of `verification_requests.ai_analysis`
--      agree on one shape. Before this migration the column received:
--        * {score, risk_level, confidence(0-100), engine, findings}   verify-credential
--        * {verdict, confidence(0.0-1.0), summary, checks, engine}    ai-verify-credential
--        * {source, confidence: 85, findings, risk_level}             oid4vp
--      The verifier portal averaged `confidence` across all of them, so a 0.85
--      fraction was mixed into a 0-100 mean. Everything written from now on
--      is schema_version 2 with confidence on a single 0-100 scale; this
--      migration rescales the legacy rows in place.
--
--   2. Record what the language-model layer actually did. There was previously
--      no way to tell whether Gemini helped, how often it failed, or what it
--      cost — a silent fallback looked identical to a fast success.
--
-- All statements are idempotent.
-- ============================================================

-- ── 1. Telemetry table for the LLM layer ─────────────────────────────────────
create table if not exists public.ai_engine_calls (
  id                bigserial primary key,
  created_at        timestamptz not null default now(),

  -- Which analysis path this was
  surface           text not null default 'verify-credential'
                     check (surface in (
                       'verify-credential',   -- verifier runs a full verification
                       'ai-verify-credential',-- holder auto-verify after accepting
                       'oid4vp',              -- OID4VP presentation
                       'ai-ask'               -- verifier asks the assistant a question
                     )),

  -- Deterministic engine
  engine            text,
  model             text,
  llm_enabled       boolean not null default false,
  degraded          boolean not null default false,
  error             text,

  -- Timing
  latency_ms        integer check (latency_ms is null or latency_ms >= 0),
  total_latency_ms  integer check (total_latency_ms is null or total_latency_ms >= 0),
  attempts          smallint not null default 0 check (attempts >= 0),

  -- Cost
  prompt_tokens        integer,
  candidates_tokens    integer,

  -- Outcome, for measuring whether the LLM layer earns its keep
  schema_version   smallint not null default 2,
  score            numeric(5, 2) check (score is null or (score >= 0 and score <= 100)),
  risk_level       text check (risk_level is null or risk_level in ('low', 'medium', 'high')),
  confidence       numeric(5, 2) check (confidence is null or (confidence >= 0 and confidence <= 100)),
  hard_caps_count  smallint not null default 0 check (hard_caps_count >= 0),

  -- Attribution
  user_id          uuid references auth.users(id) on delete set null,
  credential_id    uuid,
  request_id       uuid,

  -- Free-form extras (injection flags, etc.)
  metadata         jsonb not null default '{}'::jsonb
);

-- Dashboard queries: "how often does the LLM path actually succeed?"
create index if not exists idx_ai_engine_calls_created_at
  on public.ai_engine_calls (created_at desc);

create index if not exists idx_ai_engine_calls_surface_degraded
  on public.ai_engine_calls (surface, degraded, created_at desc);

-- Spend control is per authenticated user, not per IP: the in-memory limiters in
-- `_shared/security.ts` and `_shared/aiBudget.ts` are ephemeral, so this index
-- is what a durable quota or a cost alert would be built on.
create index if not exists idx_ai_engine_calls_user_recent
  on public.ai_engine_calls (user_id, created_at desc)
  where user_id is not null;

-- Makes a budget-capped degradation (error = 'ai_budget_exhausted') cheap to
-- find, so "why did the LLM stop being used" is one query.
create index if not exists idx_ai_engine_calls_error
  on public.ai_engine_calls (error, created_at desc)
  where error is not null;

create index if not exists idx_ai_engine_calls_credential
  on public.ai_engine_calls (credential_id)
  where credential_id is not null;

comment on column public.ai_engine_calls.error is
  'Why the LLM layer did not produce a narrative: no_api_key, ai_not_configured, ai_budget_exhausted, timeout, rate_limited, injection_flagged, or a provider error code. Null means the model answered.';

comment on table public.ai_engine_calls is
  'Per-call observability for the BlockID trust engine and its optional LLM narrative layer. One row per analysis, whether or not the LLM was invoked.';

-- ── 2. Rescale legacy `ai_analysis` rows to a single confidence scale ─────────
--
-- Rows written by `ai-verify-credential` stored confidence as a 0-1 fraction
-- and carried a `verdict` but no `score`. Rows written by `verify-credential`
-- stored 0-100. Detect the fraction rows by the 0-1 range and multiply by 100.
-- `oid4vp` rows are already 0-100 and are left alone.
update public.verification_requests
   set ai_analysis = ai_analysis || jsonb_build_object(
         'confidence', round(((ai_analysis->>'confidence')::numeric * 100)::numeric, 2)
       )
 where ai_analysis is not null
   and ai_analysis ? 'confidence'
   and (ai_analysis->>'confidence') ~ '^[0-9.]+$'
   and (ai_analysis->>'confidence')::numeric <= 1
   and (ai_analysis->>'confidence')::numeric >= 0;

-- Tag everything that predates v2 so the client normalizer can tell the
-- difference between a legacy row and a current one.
update public.verification_requests
   set ai_analysis = ai_analysis || jsonb_build_object('schema_version', 1)
 where ai_analysis is not null
   and not (ai_analysis ? 'schema_version');

-- A 0-1 confidence is now impossible going forward; the column is free-form
-- JSONB so this is enforced in the application layer and asserted in tests,
-- but the partial index makes the old rows easy to find and verify.
create index if not exists idx_verification_requests_ai_analysis_v2
  on public.verification_requests (verified_at desc)
  where ai_analysis ? 'schema_version';
