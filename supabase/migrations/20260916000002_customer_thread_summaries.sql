-- 依頼主一覧（画面）用。これまでは customers(threads(messages(...))) という
-- 二重ネストの embed + order/limit で「各依頼主の最新メッセージ」を取ろうと
-- していたが、案件トーク（kind='case'）まで一緒に取ってきてしまい無駄に重く、
-- かつ二重ネストの order/limit が想定通りに効かず未読判定がズレることがあった。
-- unread_customer_count() と同じ、確実に正しい集計方法（distinct on + 明示ソート）
-- を使った専用関数にまとめる。
create or replace function customer_thread_summaries(p_org_id uuid)
returns table (
  customer_id uuid,
  thread_id uuid,
  archived boolean,
  unread boolean,
  last_message_kind message_kind,
  last_message_body text,
  last_message_payload jsonb,
  last_message_deleted_at timestamptz
)
language sql stable as $$
  select
    t.customer_id,
    t.id as thread_id,
    (t.archived_at is not null) as archived,
    coalesce(m.sender_role = 'client' and t.archived_at is null
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
  where t.org_id = p_org_id and t.kind = 'customer' and t.customer_id is not null
$$;
grant execute on function customer_thread_summaries(uuid) to authenticated;
