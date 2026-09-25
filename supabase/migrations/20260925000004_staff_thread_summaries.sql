-- スタッフ一覧にも依頼主一覧と同じ「最後のやり取り・未読」を軽く表示したい
-- （customer_thread_summaries と同じパターン）。internal スレッド（本部⇄スタッフ）
-- 版として staff_thread_summaries を用意する。RLSはそのまま効くので、
-- 呼び出し側が権限を持つスレッドしか返らない（オーナー・統括担当は全員分、
-- 一般スタッフは自分の分だけ）。
create function staff_thread_summaries(p_org_id uuid)
returns table (
  staff_profile_id uuid,
  thread_id uuid,
  unread boolean,
  last_message_kind message_kind,
  last_message_body text,
  last_message_payload jsonb,
  last_message_deleted_at timestamptz
)
language sql stable as $$
  select
    t.staff_profile_id,
    t.id as thread_id,
    coalesce(m.sender_role not in ('owner', 'supervisor')
      and (t.last_read_at is null or t.last_msg_at > t.last_read_at), false) as unread,
    m.kind as last_message_kind,
    m.body as last_message_body,
    m.payload as last_message_payload,
    m.deleted_at as last_message_deleted_at
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
