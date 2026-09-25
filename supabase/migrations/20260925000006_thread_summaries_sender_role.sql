-- 依頼主一覧の最終メッセージに「依頼主：」「担当者：」を付けられるように、
-- customer_thread_summaries() に最後のメッセージの sender_role を追加する。
-- 戻り値の形が変わるので、一度dropしてから作り直す。
drop function if exists customer_thread_summaries(uuid);
create function customer_thread_summaries(p_org_id uuid)
returns table (
  customer_id uuid,
  thread_id uuid,
  archived boolean,
  unread boolean,
  department_id uuid,
  last_message_kind message_kind,
  last_message_body text,
  last_message_payload jsonb,
  last_message_deleted_at timestamptz,
  last_message_sender_role app_role
)
language sql stable as $$
  select
    t.customer_id,
    t.id as thread_id,
    (t.archived_at is not null) as archived,
    coalesce(m.sender_role = 'client' and t.archived_at is null
      and (t.last_read_at is null or t.last_msg_at > t.last_read_at), false) as unread,
    t.department_id,
    m.kind as last_message_kind,
    m.body as last_message_body,
    m.payload as last_message_payload,
    m.deleted_at as last_message_deleted_at,
    m.sender_role as last_message_sender_role
  from threads t
  left join lateral (
    select kind, body, payload, deleted_at, sender_role
    from messages
    where thread_id = t.id
    order by sent_at desc
    limit 1
  ) m on true
  where t.org_id = p_org_id and t.kind = 'customer' and t.customer_id is not null
$$;
grant execute on function customer_thread_summaries(uuid) to authenticated;
