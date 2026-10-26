-- 窓口のURLから入ったトークは、最初の1回だけ窓口の印と担当秘書を付ける。
--
-- 前：依頼主がまだ何も書いていない間は、ページを開くたびに担当が窓口の
--     担当秘書に戻っていた（本部が別の秘書に振り直しても元に戻る）。
-- 後：すでに窓口の印（desk_id）が付いているトークには何もしない。
create or replace function claim_desk_thread(p_desk_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d inquiry_desks%rowtype;
  t_id uuid;
begin
  select * into d from inquiry_desks where id = p_desk_id;
  if not found or not d.active then
    return;
  end if;

  select t.id into t_id
  from customers c
  join threads t on t.customer_id = c.id and t.kind = 'customer'
  where c.profile_id = auth.uid() and c.org_id = d.org_id and c.member_no is null and t.desk_id is null
  limit 1;
  if t_id is null then
    return;
  end if;

  update threads set desk_id = d.id, department_id = d.department_id where id = t_id;

  update messages
  set body = desk_welcome_text(d.name)
  where thread_id = t_id and sender_id is null and sender_role is null and kind = 'text';
end $$;
grant execute on function claim_desk_thread(uuid) to authenticated;
