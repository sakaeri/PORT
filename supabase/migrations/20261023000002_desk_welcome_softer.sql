-- 問い合わせ窓口の最初のあいさつを、事務的すぎないやわらかい文面にする。
-- すでに差し替え済みのトーク（前の文面のまま）も新しい文面にそろえる。

create or replace function desk_welcome_text(p_name text) returns text
language sql immutable as $$
  select 'こんにちは、' || p_name || ' お問い合わせ窓口です。' || chr(10) ||
         '使い方で分からないことや気になることがあれば、どんなことでも気軽に送ってくださいね。' || chr(10) ||
         '内容を確認して、こちらのチャットでお返事します。'
$$;

create or replace function claim_desk_thread(p_desk_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d inquiry_desks%rowtype;
  t_id uuid;
begin
  select * into d from inquiry_desks where id = p_desk_id;
  if not found or not d.active or d.department_id is null then
    return;
  end if;

  select t.id into t_id
  from customers c
  join threads t on t.customer_id = c.id and t.kind = 'customer'
  where c.profile_id = auth.uid() and c.org_id = d.org_id and c.member_no is null
  limit 1;
  if t_id is null then
    return;
  end if;

  update threads set department_id = d.department_id
  where id = t_id and department_id is distinct from d.department_id;

  update messages
  set body = desk_welcome_text(d.name)
  where thread_id = t_id and sender_id is null and sender_role is null and kind = 'text';
end $$;
grant execute on function claim_desk_thread(uuid) to authenticated;

update messages m
set body = desk_welcome_text(d.name)
from threads t
join inquiry_desks d on d.department_id = t.department_id
where m.thread_id = t.id
  and m.sender_id is null and m.sender_role is null and m.kind = 'text'
  and m.body = d.name || 'のお問い合わせ窓口です。' || chr(10) || 'ご用件をこちらのチャットでお送りください。';
