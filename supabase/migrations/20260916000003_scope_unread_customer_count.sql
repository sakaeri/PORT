-- unread_customer_count() は org_id の絞り込みを持たず、RLS（threads_read/
-- messages_read）だけに事業所の絞り込みを任せていた。当時はそれで正しかったが、
-- 20260914000011_realtime_org_visibility.sql で is_staff_of() に切り替えた際、
-- 受付の可視範囲が「今選んでいる事業所」ではなく「リンクしている全事業所」に
-- 広がったため、複数事業所を掛け持ちするスタッフ（本部アカウント含む）だと
-- サイドバーの未読件数が全事業所合算になってしまっていた
-- （事業所Aで既読にすると事業所Bの表示も一緒に減って見えるバグとして発覚）。
-- customer_thread_summaries() と同じく、明示的に org_id を絞り込むようにする。
drop function if exists unread_customer_count();
create or replace function unread_customer_count(p_org_id uuid) returns integer
language sql stable as $$
  select count(*)::int from (
    select distinct on (t.id) t.id, m.sender_role, t.last_msg_at, t.last_read_at
    from threads t
    join messages m on m.thread_id = t.id
    where t.kind = 'customer' and t.archived_at is null and t.org_id = p_org_id
    order by t.id, m.sent_at desc
  ) last
  where last.sender_role = 'client'
    and (last.last_read_at is null or last.last_msg_at > last.last_read_at)
$$;
grant execute on function unread_customer_count(uuid) to authenticated;
