-- 問い合わせ窓口を「担当秘書が受け持つもの」に作り直す。
--
-- 前：窓口ごとに専用の部署（問い合わせ：〇〇）を作り、トークをそこに入れていた
--     → 本部しか見られず、秘書が窓口を受け持てなかった。
-- 後：トークがどの窓口のものかは threads.desk_id で持ち、担当は今まで通り
--     threads.department_id（秘書の窓口）で持つ。inquiry_desks.department_id は
--     「この窓口の担当秘書」を表す（null なら本部）。窓口から来た新しいトークは
--     その担当秘書に自動で割り当てられる。
--
-- 依頼主の画面（チャットだけになるか）も、URL ではなくトークの desk_id で決まる。

alter table threads add column if not exists desk_id uuid references inquiry_desks(id) on delete set null;

-- 今「問い合わせ：〇〇」部署に入っているトークを、窓口の印に移して本部の担当に戻す。
update threads t
set desk_id = d.id, department_id = null
from inquiry_desks d
where d.department_id is not null and t.department_id = d.department_id;

-- 専用部署は片付ける（inquiry_desks.department_id は on delete set null で本部に戻る）。
delete from departments where id in (select department_id from inquiry_desks where department_id is not null);

-- 依頼主アプリが、自分のトークの窓口名を引くためのもの（ログイン後）。
create or replace function desk_by_id(p_id uuid)
returns table(id uuid, org_id uuid, name text, active boolean)
language sql stable security definer set search_path = public as $$
  select d.id, d.org_id, d.name, d.active from inquiry_desks d where d.id = p_id
$$;
grant execute on function desk_by_id(uuid) to authenticated;

-- 窓口から入った人の、まだ何も書いていないトークに窓口の印を付け、担当秘書に割り当てる。
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
  where c.profile_id = auth.uid() and c.org_id = d.org_id and c.member_no is null
  limit 1;
  if t_id is null then
    return;
  end if;

  update threads set desk_id = d.id, department_id = d.department_id
  where id = t_id and (desk_id is distinct from d.id or department_id is distinct from d.department_id);

  update messages
  set body = desk_welcome_text(d.name)
  where thread_id = t_id and sender_id is null and sender_role is null and kind = 'text';
end $$;
grant execute on function claim_desk_thread(uuid) to authenticated;
