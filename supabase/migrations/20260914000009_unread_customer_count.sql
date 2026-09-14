-- サイドバーの「依頼主」に出す未読件数。RLS(threads_read/messages_read)が
-- 既に受付には自分の事業所の全スレッド/メッセージを見せる作りになっているので、
-- security definer にせず素の関数のままにして RLS に権限判定を任せる。
create or replace function unread_customer_count() returns integer
language sql stable as $$
  select count(*)::int from (
    select distinct on (t.id) t.id, m.sender_role, t.last_msg_at, t.last_read_at
    from threads t
    join messages m on m.thread_id = t.id
    where t.kind = 'customer' and t.archived_at is null
    order by t.id, m.sent_at desc
  ) last
  where last.sender_role = 'client'
    and (last.last_read_at is null or last.last_msg_at > last.last_read_at)
$$;
grant execute on function unread_customer_count() to authenticated;
