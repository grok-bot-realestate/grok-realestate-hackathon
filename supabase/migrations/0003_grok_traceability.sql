-- Additive Grok traceability columns for Line Inbox.
-- Backwards-compatible with existing frontend queries.

alter table public.records
  add column if not exists triage_source text,
  add column if not exists grok_model text,
  add column if not exists grok_latency_ms int,
  add column if not exists grok_reasoning text,
  add column if not exists evidence_quotes jsonb not null default '[]'::jsonb,
  add column if not exists draft_reply text;
