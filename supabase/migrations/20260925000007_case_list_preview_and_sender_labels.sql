-- 案件一覧にも依頼主一覧・スタッフ一覧と同じ「最後のやり取り」を表示する
-- ための case_thread_summaries()（customer_thread_summaries / staff_thread_summaries
-- と同じパターン）。あわせて staff_thread_summaries() にも最後のメッセージの
-- sender_role を足して、スタッフ一覧のプレビューにも役職ラベルを付けられる
-- ようにする。

create function case_thread_summaries(p_org_id uuid)
returns table (
  request_id uuid,
  thread_id uuid,
  last_message_kind message_kind,
  last_message_body text,
  last_message_payload jsonb,
  last_message_deleted_at timestamptz,
  last_message_sender_role app_role
)
language sql stable as $$
  select
    t.request_id,
    t.id as thread_id,
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
  where t.org_id = p_org_id and t.kind = 'case' and t.request_id is not null
$$;
grant execute on function case_thread_summaries(uuid) to authenticated;

drop function if exists staff_thread_summaries(uuid);
create function staff_thread_summaries(p_org_id uuid)
returns table (
  staff_profile_id uuid,
  thread_id uuid,
  unread boolean,
  last_message_kind message_kind,
  last_message_body text,
  last_message_payload jsonb,
  last_message_deleted_at timestamptz,
  last_message_sender_role app_role
)
language sql stable as $$
  select
    t.staff_profile_id,
    t.id as thread_id,
    coalesce(m.sender_role <> 'owner'
      and (t.last_read_at is null or t.last_msg_at > t.last_read_at), false) as unread,
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
  where t.org_id = p_org_id and t.kind = 'internal' and t.staff_profile_id is not null
$$;
grant execute on function staff_thread_summaries(uuid) to authenticated;
