-- Task 3: keep the AI's reason for a lead's category in Thai as well as English,
-- so the staff lead list can show it in the language the viewer picked.
-- Safe to run on an existing database: adds one nullable column and replaces one function.
-- Older leads keep only the English reason; the lead list falls back to it.

begin;

alter table public.lead_submissions
  add column if not exists classification_reason_th text
  check (classification_reason_th is null or length(classification_reason_th) <= 500);

-- Same as migration 006, plus the optional Thai reason ("reasonTh") on 'classify'.
-- p_action 'classify': {submissionId, classification, source, reason, reasonTh}
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
      classification_reason_th = left(nullif(p_payload->>'reasonTh', ''), 500),
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

revoke all on function public.lead_record(text, jsonb) from public, anon, authenticated;
grant execute on function public.lead_record(text, jsonb) to service_role;

commit;

-- Expect one row: classification_reason_th | text.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'lead_submissions' and column_name = 'classification_reason_th';
