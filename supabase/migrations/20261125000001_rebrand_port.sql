-- 中央秘書の事業をやめ、お問い合わせ窓口（PORT）だけにする。
-- 1. 事業所の表示名を「PORT」に（画面上部・通知メールの【】に出る）。
-- 2. 担当者ごとの窓口（departments）の名前「秘書：〇〇」を「担当：〇〇」に。
-- 3. 窓口ではないトップから新しく作られるトークの最初のあいさつから「中央秘書事務所」をなくす。

update organizations set display_name = 'PORT' where display_name like '%中央秘書%';

update departments set name = '担当：' || substr(name, 4) where name like '秘書：%';

create or replace function ensure_customer_for_org(p_org_id uuid, p_desk_id uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  result_id uuid;
  new_thread_id uuid;
  d inquiry_desks%rowtype;
begin
  select id into result_id from customers
  where profile_id = auth.uid() and org_id = p_org_id and desk_id is not distinct from p_desk_id;
  if result_id is not null then
    return result_id;
  end if;

  if p_desk_id is not null then
    select * into d from inquiry_desks where id = p_desk_id;
    if not found or d.org_id <> p_org_id or not d.active then
      return null;
    end if;
  end if;

  -- すでに別のトーク（いつもの／ほかの窓口）で名前や規約の同意を済ませていれば引き継ぐ。
  insert into customers (org_id, profile_id, name, member_no, desk_id, terms_accepted_at)
  select p_org_id, auth.uid(), coalesce(prev.name, '未登録の依頼主'), null, p_desk_id, prev.terms_accepted_at
  from (select 1) one
  left join lateral (
    select c.name, c.terms_accepted_at from customers c
    where c.profile_id = auth.uid() and c.org_id = p_org_id and c.name <> '未登録の依頼主'
    order by c.created_at
    limit 1
  ) prev on true
  on conflict do nothing
  returning id into result_id;

  if result_id is null then
    select id into result_id from customers
    where profile_id = auth.uid() and org_id = p_org_id and desk_id is not distinct from p_desk_id;
    return result_id;
  end if;

  insert into threads (org_id, kind, customer_id, last_msg_at, desk_id, department_id)
  values (p_org_id, 'customer', result_id, now(), p_desk_id, case when p_desk_id is not null then d.department_id end)
  returning id into new_thread_id;

  insert into messages (thread_id, sender_id, sender_role, kind, body)
  values (
    new_thread_id, null, null, 'text',
    case
      when p_desk_id is not null then desk_welcome_text(d.name)
      else
        'ご用件はお気軽にチャットでお送りください。'
    end
  );

  return result_id;
end $$;
grant execute on function ensure_customer_for_org(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
