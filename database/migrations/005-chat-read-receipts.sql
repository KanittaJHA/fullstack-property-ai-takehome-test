-- Run after 004-chat-runtime.sql. Existing messages are not marked read retroactively.
begin;
alter table public.conversations
  add column if not exists admin_read_through uuid,
  add column if not exists customer_read_through uuid;
create or replace function public.graspia_chat_snapshot(p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'conversation', jsonb_build_object(
      'adminReadThrough', c.admin_read_through, 'customerReadThrough', c.customer_read_through,
      'id', c.id, 'status', c.status, 'pinned', c.pinned,
      'handover', c.escalated_at is not null, 'reason', c.handover_reason,
      'summary', c.handover_summary, 'confidence', c.confidence,
      'createdAt', to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'updatedAt', to_char(c.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'messages', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'role', m.role, 'content', m.content,
        'createdAt', to_char(m.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) order by m.sequence_number) from public.messages m where m.conversation_id = c.id), '[]'::jsonb)
    ),
    'revision', c.revision, 'lease', c.turn_lease, 'expires', c.lease_expires_at,
    'requests', coalesce((select jsonb_object_agg(r.request_id::text, r.fingerprint)
      from public.chat_requests r where r.conversation_id = c.id), '{}'::jsonb)
  ) from public.conversations c where c.id = p_id;
$$;

-- All identities/business IDs come from the backend, never browser-supplied IDs.
-- EXECUTE is granted ONLY to service_role; RLS and grants deny direct browser access.
create or replace function public.graspia_chat_store(p_action text, p_business text, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_owner text := p_payload->>'owner';
  v_row public.conversations%rowtype;
  v_doc jsonb;
  v_message jsonb;
  v_request record;
  v_target uuid;
  v_import boolean := false;
begin
  if p_action in ('create', 'import', 'delete') then
    if v_owner is null or v_owner !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_OWNER'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_business || ':' || v_owner, 0));
  end if;
  if p_action = 'list' then
    return coalesce((select jsonb_agg(public.graspia_chat_snapshot(q.id) order by q.created_at desc, q.id)
      from (select id, created_at from public.conversations
        where business_id = p_business and (v_owner is null or owner_token_hash = v_owner)
        order by created_at desc, id limit case when v_owner is null then 100 else 30 end) q), '[]'::jsonb);
  elsif p_action = 'create' then
    select c.id into v_id from public.conversations c
      where c.business_id = p_business and c.owner_token_hash = v_owner and c.status = 'bot_active'
        and not exists (select 1 from public.messages m where m.conversation_id = c.id)
      order by c.created_at desc limit 1;
    if v_id is not null then return public.graspia_chat_snapshot(v_id); end if;
    if (select count(*) from public.conversations where business_id = p_business and owner_token_hash = v_owner) >= 30 then
      raise exception 'CONVERSATION_LIMIT';
    end if;
    insert into public.conversations (business_id, owner_token_hash) values (p_business, v_owner) returning id into v_id;
    return public.graspia_chat_snapshot(v_id);
  elsif p_action = 'import' then
    v_doc := p_payload->'conversation';
    v_id := (v_doc->>'id')::uuid;
    -- An existing record can have newer messages: never overwrite it on a rerun.
    insert into public.conversations (id, business_id, owner_token_hash)
      values (v_id, p_business, v_owner) on conflict (id) do nothing;
    if not found then
      if not exists (select 1 from public.conversations where id=v_id and business_id=p_business and owner_token_hash=v_owner) then
        raise exception 'NOT_FOUND';
      end if;
      return 'false'::jsonb;
    end if;
    v_import := true;
  else
    v_id := (p_payload->>'id')::uuid;
  end if;
  select * into v_row from public.conversations where id = v_id and business_id = p_business
    and (v_owner is null or owner_token_hash = v_owner) for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_action = 'get' then return public.graspia_chat_snapshot(v_id); end if;
  if p_action = 'delete' then
    if v_row.status = 'bot_active' and not exists (select 1 from public.messages where conversation_id = v_id) then
      -- Legacy empty duplicates represent the same empty draft in the UI.
      for v_target in select c.id from public.conversations c where c.business_id=p_business
        and c.owner_token_hash=v_owner and c.status='bot_active' order by c.id for update
      loop
        if not exists (select 1 from public.messages where conversation_id=v_target) then
          delete from public.chat_requests where conversation_id=v_target;
          delete from public.conversations where id=v_target;
        end if;
      end loop;
    else
      delete from public.chat_requests where conversation_id=v_id;
      delete from public.messages where conversation_id=v_id;
      delete from public.conversations where id=v_id;
    end if;
    return 'true'::jsonb;
  end if;
  if p_action <> 'commit' and not v_import then raise exception 'INVALID_ACTION'; end if;
  if not v_import and v_row.revision <> (p_payload->>'revision')::bigint then raise exception 'REVISION_CONFLICT'; end if;
  v_doc := p_payload->'conversation';
  if (v_doc->>'id')::uuid <> v_id or jsonb_typeof(v_doc->'messages') <> 'array' then raise exception 'INVALID_DOCUMENT'; end if;
  update public.conversations set
    admin_read_through=(v_doc->>'adminReadThrough')::uuid,
    customer_read_through=(v_doc->>'customerReadThrough')::uuid,
    status=v_doc->>'status', pinned=coalesce((v_doc->>'pinned')::boolean,false),
    confidence=(v_doc->>'confidence')::double precision,
    handover_reason=v_doc->>'reason', handover_summary=v_doc->>'summary',
    escalated_at=case when (v_doc->>'handover')::boolean then coalesce(escalated_at,(v_doc->>'updatedAt')::timestamptz) else null end,
    created_at=(v_doc->>'createdAt')::timestamptz, updated_at=(v_doc->>'updatedAt')::timestamptz,
    revision=revision+1, turn_lease=(p_payload->>'lease')::uuid,
    lease_expires_at=coalesce((p_payload->>'expires')::bigint,0)
    where id=v_id;
  for v_message in select value from jsonb_array_elements(v_doc->'messages') loop
    insert into public.messages (id, conversation_id, role, content, request_id, created_at)
      values ((v_message->>'id')::uuid,v_id,v_message->>'role',v_message->>'content',
        (v_message->>'id')::uuid,(v_message->>'createdAt')::timestamptz)
      on conflict (id) do nothing;
  end loop;
  for v_request in select key, value from jsonb_each_text(coalesce(p_payload->'requests','{}'::jsonb)) loop
    insert into public.chat_requests (conversation_id,request_id,fingerprint)
      values (v_id,v_request.key::uuid,v_request.value) on conflict do nothing;
  end loop;
  if v_import then return 'true'::jsonb; end if;
  return public.graspia_chat_snapshot(v_id);
end;
$$;
revoke all on function public.graspia_chat_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.graspia_chat_store(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.graspia_chat_snapshot(uuid) to service_role;
grant execute on function public.graspia_chat_store(text,text,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
