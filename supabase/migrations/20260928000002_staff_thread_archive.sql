-- スタッフ一覧にも依頼主・案件一覧と同じ「非表示」を持たせる。スタッフ本人を
-- 消さずに、本部⇄本人の内部スレッド（kind='internal'）だけをアーカイブする
-- 形にすることで、新しい列を増やさず customers/threads と同じ仕組みを流用する。
drop function if exists staff_thread_summaries(uuid);
create function staff_thread_summaries(p_org_id uuid)
returns table (
  staff_profile_id uuid,
  thread_id uuid,
  archived boolean,
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
    (t.archived_at is not null) as archived,
    coalesce(m.sender_role <> 'owner' and t.archived_at is null
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
