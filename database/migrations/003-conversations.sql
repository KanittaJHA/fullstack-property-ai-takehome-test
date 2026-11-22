-- Run after 002-business-profile.sql. Creates empty tables; no sample chats.
-- Safe to rerun for this schema: existing conversations/messages are preserved.
begin;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.business_profiles(id),
  -- Server-generated visitor token hash, never a client-supplied identity.
  -- The API must check ownership on EVERY read/write; service_role bypasses RLS.
  owner_token_hash text not null check (owner_token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'bot_active'
    check (status in ('bot_active', 'awaiting_human', 'human_active', 'closed')),
  handover_reason text,
  handover_summary text,
  escalated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversation_handover_details check (
    (escalated_at is null and handover_reason is null and handover_summary is null)
    or
    (escalated_at is not null and
      coalesce(length(btrim(handover_reason)), 0) > 0 and
      coalesce(length(btrim(handover_summary)), 0) > 0)
  ),
  constraint conversation_human_requires_escalation check (
    status not in ('awaiting_human', 'human_active') or escalated_at is not null
  )
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id),
  -- Stable ordering even when several messages share the same timestamp.
  sequence_number bigint generated always as identity unique,
  role text not null check (role in ('user', 'assistant', 'human', 'system')),
  content text not null check (length(btrim(content)) between 1 and 12000),
  -- Reuse this ID for retries of the same send operation.
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (conversation_id, request_id, role)
);

create index if not exists conversations_owner_updated_idx
  on public.conversations (business_id, owner_token_hash, updated_at desc);
create index if not exists messages_conversation_sequence_idx
  on public.messages (conversation_id, sequence_number);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
revoke all on table public.conversations, public.messages from public, anon, authenticated;
revoke all on table public.conversations, public.messages from service_role;
grant select, insert, update on public.conversations to service_role;
grant select, insert on public.messages to service_role;
revoke all on sequence public.messages_sequence_number_seq from public, anon, authenticated;
grant usage on sequence public.messages_sequence_number_seq to service_role;
-- No public policies: browser clients must use the server API.
-- The future chat API must atomically save messages, advance updated_at,
-- enforce ownership, and prevent bot replies after escalation.

commit;

-- Expect two rows with rls_enabled = true.
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where oid in ('public.conversations'::regclass, 'public.messages'::regclass)
order by relname;
