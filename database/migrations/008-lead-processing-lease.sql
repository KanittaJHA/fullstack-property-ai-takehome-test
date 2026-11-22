-- Task 3: score each lead message once, even when identical copies arrive within seconds.
-- Before: a copy arriving while the first run was still scoring was treated like a stuck lead and scored again
-- (more AI calls, and with real SMS a second auto-reply). Now the run that saves or takes over a message holds a
-- 2-minute lease; copies inside the lease are answered "already received". When a run stops half-way, the lease
-- runs out and the next copy finishes the message, so stuck leads are still recovered.
-- Safe to run on an existing database: adds one nullable column and replaces lead_intake. Run after 007.

begin;

alter table public.lead_submissions add column if not exists processing_until timestamptz;

-- Same as migration 006, plus the processing lease and the "inProgress" flag on replays.
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
    -- Not scored yet: another run may still be working on it. Only one run at a time may finish it;
    -- a copy that arrives inside that window is answered "already received" without calling the AI.
    -- After the lease runs out (a run that stopped half-way), the next copy takes over and finishes it.
    if v_existing.classification is null then
      if v_existing.processing_until > now() then
        return jsonb_build_object('status', 'replay', 'leadId', v_existing.lead_id,
          'submissionId', v_existing.id, 'isRepeat', v_existing.is_repeat,
          'classification', null, 'inProgress', true);
      end if;
      update public.lead_submissions set processing_until = now() + interval '2 minutes' where id = v_existing.id;
    end if;
    return jsonb_build_object('status', 'replay', 'leadId', v_existing.lead_id,
      'submissionId', v_existing.id, 'isRepeat', v_existing.is_repeat,
      'classification', v_existing.classification, 'inProgress', false);
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

  insert into public.lead_submissions (lead_id, request_key, message, budget, area, is_repeat, processing_until)
  values (v_lead.id, v_key, left(v_message, 4000), v_budget,
    nullif(left(btrim(coalesce(p_lead->>'area', '')), 120), ''), v_repeat, now() + interval '2 minutes')
  returning id into v_submission;

  return jsonb_build_object('status', 'accepted', 'leadId', v_lead.id, 'submissionId', v_submission,
    'isRepeat', v_repeat, 'previousClassification', v_previous);
end;
$$;

revoke all on function public.lead_intake(jsonb) from public, anon, authenticated;
grant execute on function public.lead_intake(jsonb) to service_role;

commit;

-- Expect one row: processing_until | timestamp with time zone.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'lead_submissions' and column_name = 'processing_until';
