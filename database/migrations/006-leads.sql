-- Task 3: property leads received by the n8n automation workflow.
-- Run after 005-chat-read-receipts.sql, as the project owner in Supabase SQL Editor.
-- Additive: creates new tables and functions only; existing data is untouched.
-- Safe to rerun: tables use IF NOT EXISTS and functions are replaced.
begin;

-- One row per person. Repeat leads from the same phone or email reuse this row.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  phone text,
  email text,
  -- Normalised keys used for de-duplication (digits-only Thai phone, lower-case email).
  phone_key text check (phone_key ~ '^0[0-9]{8,9}$'),
  email_key text check (email_key = lower(email_key) and length(email_key) <= 254),
  latest_classification text check (latest_classification in ('hot', 'warm', 'cold')),
  submission_count integer not null default 1 check (submission_count >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_has_contact check (phone_key is not null or email_key is not null)
);
create unique index if not exists leads_phone_key_idx on public.leads (phone_key) where phone_key is not null;
create unique index if not exists leads_email_key_idx on public.leads (email_key) where email_key is not null;

-- One row per accepted form submission, with its AI (or rule-based) classification.
create table if not exists public.lead_submissions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  -- Hash of the normalised submission, computed by the workflow. A retried webhook
  -- with the same content maps to the same row instead of creating a second one.
  request_key text not null unique check (request_key ~ '^[0-9a-f]{64}$'),
  message text not null check (length(btrim(message)) between 1 and 4000),
  budget numeric check (budget is null or budget >= 0),
  area text check (area is null or length(area) <= 120),
  is_repeat boolean not null default false,
  classification text check (classification in ('hot', 'warm', 'cold')),
  classification_source text check (classification_source in ('ai', 'rules')),
  classification_reason text check (classification_reason is null or length(classification_reason) <= 500),
  classified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists lead_submissions_lead_created_idx
  on public.lead_submissions (lead_id, created_at desc);

-- Notification log / outbox: at most one team alert and one auto-reply per submission,
-- so a retried workflow run cannot notify twice.
create table if not exists public.lead_notifications (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.lead_submissions(id) on delete cascade,
  kind text not null check (kind in ('team_alert', 'auto_reply')),
  status text not null check (status in ('sent', 'failed', 'skipped')),
  channel text not null check (length(channel) between 1 and 40),
  attempts integer not null default 1 check (attempts >= 1),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, kind)
);

alter table public.leads enable row level security;
alter table public.lead_submissions enable row level security;
alter table public.lead_notifications enable row level security;
revoke all on public.leads, public.lead_submissions, public.lead_notifications from public, anon, authenticated;
-- The functions below run as the caller (security invoker), so the service role needs write access.
-- Delete is allowed for data-retention clean-up and removing test leads.
grant select, insert, update, delete on public.leads, public.lead_submissions, public.lead_notifications to service_role;
-- No policies: browsers cannot read leads; only the workflow, using the service role, can.

-- Normalise a Thai phone number to 0XXXXXXXX(X); returns null when it is not plausible.
create or replace function public.lead_phone_key(p_phone text)
returns text language sql immutable set search_path = '' as $$
  select case
    when d ~ '^0[0-9]{8,9}$' then d
    when d ~ '^66[0-9]{8,9}$' then '0' || substr(d, 3)
    else null end
  from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as d) s;
$$;

-- Store one validated lead. Returns {status, leadId, submissionId, isRepeat, previousClassification}.
-- status: accepted | replay (same submission already stored) | rate_limited | invalid
create or replace function public.lead_intake(p_lead jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_lead->>'name', ''));
  v_phone text := nullif(btrim(coalesce(p_lead->>'phone', '')), '');
  v_email text := nullif(btrim(coalesce(p_lead->>'email', '')), '');
  v_message text := btrim(coalesce(p_lead->>'message', ''));
  v_key text := p_lead->>'requestKey';
  v_phone_key text := public.lead_phone_key(p_lead->>'phone');
  v_email_key text := lower(v_email);
  v_budget numeric;
  v_lead public.leads%rowtype;
  v_existing public.lead_submissions%rowtype;
  v_submission uuid;
  v_repeat boolean := false;
  v_previous text;
begin
  if v_email_key is not null and v_email_key !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then v_email_key := null; end if;
  if length(v_name) = 0 or length(v_message) = 0 or (v_phone_key is null and v_email_key is null)
     or v_key is null or v_key !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  begin
    v_budget := nullif(p_lead->>'budget', '')::numeric;
  exception when others then
    v_budget := null;
  end;

  -- Serialise concurrent submissions for the same contact so duplicates cannot race.
  perform pg_advisory_xact_lock(hashtextextended('lead:' || coalesce(v_phone_key, v_email_key), 0));
  if v_phone_key is not null and v_email_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('lead:' || v_email_key, 0));
  end if;

  select * into v_existing from public.lead_submissions where request_key = v_key;
  if found then
    return jsonb_build_object('status', 'replay', 'leadId', v_existing.lead_id,
      'submissionId', v_existing.id, 'isRepeat', v_existing.is_repeat,
      'classification', v_existing.classification);
  end if;

  -- Phone is the stronger identity; fall back to email.
  select * into v_lead from public.leads where v_phone_key is not null and phone_key = v_phone_key;
  if not found then
    select * into v_lead from public.leads where v_email_key is not null and email_key = v_email_key;
  end if;

  if found then
    if (select count(*) from public.lead_submissions s
        where s.lead_id = v_lead.id and s.created_at > now() - interval '10 minutes') >= 3 then
      return jsonb_build_object('status', 'rate_limited', 'leadId', v_lead.id);
    end if;
    v_repeat := true;
    v_previous := v_lead.latest_classification;
    update public.leads set
      name = v_name,
      phone = coalesce(phone, v_phone),
      email = coalesce(email, v_email),
      phone_key = coalesce(phone_key, case when not exists
        (select 1 from public.leads o where o.phone_key = v_phone_key) then v_phone_key end),
      email_key = coalesce(email_key, case when not exists
        (select 1 from public.leads o where o.email_key = v_email_key) then v_email_key end),
      submission_count = submission_count + 1,
      updated_at = now()
    where id = v_lead.id;
  else
    insert into public.leads (name, phone, email, phone_key, email_key)
    values (v_name, v_phone, v_email, v_phone_key, v_email_key)
    returning * into v_lead;
  end if;

  insert into public.lead_submissions (lead_id, request_key, message, budget, area, is_repeat)
  values (v_lead.id, v_key, left(v_message, 4000), v_budget,
    nullif(left(btrim(coalesce(p_lead->>'area', '')), 120), ''), v_repeat)
  returning id into v_submission;

  return jsonb_build_object('status', 'accepted', 'leadId', v_lead.id, 'submissionId', v_submission,
    'isRepeat', v_repeat, 'previousClassification', v_previous);
end;
$$;

-- Record the classification or a notification outcome for one submission.
-- p_action 'classify': {submissionId, classification, source, reason}
-- p_action 'notify':   {submissionId, kind, status, channel, detail}; a retry increments attempts.
create or replace function public.lead_record(p_action text, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_submission uuid := (p_payload->>'submissionId')::uuid;
  v_lead uuid;
  v_row public.lead_notifications%rowtype;
begin
  if p_action = 'classify' then
    update public.lead_submissions set
      classification = p_payload->>'classification',
      classification_source = p_payload->>'source',
      classification_reason = left(p_payload->>'reason', 500),
      classified_at = now()
    where id = v_submission returning lead_id into v_lead;
    if v_lead is null then raise exception 'LEAD_SUBMISSION_NOT_FOUND'; end if;
    update public.leads set latest_classification = p_payload->>'classification', updated_at = now()
    where id = v_lead;
    return jsonb_build_object('ok', true);
  elsif p_action = 'notify' then
    insert into public.lead_notifications (submission_id, kind, status, channel, detail)
    values (v_submission, p_payload->>'kind', p_payload->>'status', p_payload->>'channel',
      coalesce(p_payload->'detail', '{}'::jsonb))
    on conflict (submission_id, kind) do update set
      status = excluded.status, channel = excluded.channel, detail = excluded.detail,
      attempts = public.lead_notifications.attempts + 1, updated_at = now()
    returning * into v_row;
    return jsonb_build_object('ok', true, 'attempts', v_row.attempts);
  end if;
  raise exception 'UNKNOWN_LEAD_ACTION';
end;
$$;

revoke all on function public.lead_phone_key(text) from public, anon, authenticated;
revoke all on function public.lead_intake(jsonb) from public, anon, authenticated;
revoke all on function public.lead_record(text, jsonb) from public, anon, authenticated;
grant execute on function public.lead_phone_key(text) to service_role;
grant execute on function public.lead_intake(jsonb) to service_role;
grant execute on function public.lead_record(text, jsonb) to service_role;

commit;

-- Expect three rows with rls_enabled = true.
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where oid in ('public.leads'::regclass, 'public.lead_submissions'::regclass, 'public.lead_notifications'::regclass)
order by relname;
