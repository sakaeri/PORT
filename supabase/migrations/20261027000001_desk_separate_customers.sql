-- 問い合わせ窓口（/teera など）のトークを、いつもの中央秘書のトークと分ける。
--
-- 前：1人につきトークは1つで、まだ何も書いていない人だけ窓口のトークに
--     切り替えていた。すでに中央秘書でやり取りしている人が窓口のURLを
--     開くと、いつものトークのままになり、バグのように見えた。
-- 後：窓口ごとに依頼主の行（customers）を分ける（customers.desk_id）。
--     窓口のURLから来たら必ずその窓口のトーク、いつものURLならいつもの
--     トーク。本部の依頼主一覧では、同じ人が別々の行に並ぶ。
--
-- どちらの行を使うかは、proxy.ts が付ける x-vid-desk ヘッダーで決める
-- （x-vid-org と同じ仕組み）。my_customer_id() もそれに合わせる。

alter table customers add column if not exists desk_id uuid references inquiry_desks(id);

-- 今までに窓口の印が付いたトークの持ち主は、その窓口の依頼主として扱う。
update customers c
set desk_id = t.desk_id
from threads t
where t.customer_id = c.id and t.kind = 'customer' and t.desk_id is not null and c.desk_id is null;

-- 1人・1事業所につき、いつもの行1つ＋窓口ごとに1つずつ。
alter table customers drop constraint if exists customers_profile_org_unique;
create unique index if not exists customers_profile_org_desk_unique
  on customers (profile_id, org_id, coalesce(desk_id, '00000000-0000-0000-0000-000000000000'::uuid));

create or replace function current_request_desk() returns uuid
language sql stable as $$
  select nullif(current_setting('request.headers', true)::json->>'x-vid-desk', '')::uuid
$$;

create or replace function my_customer_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from customers
  where profile_id = auth.uid() and org_id = auth_org() and desk_id is not distinct from current_request_desk()
$$;

-- 依頼主の行とトークを用意する。窓口なら、トークに窓口の印と担当秘書を付け、
-- あいさつも窓口用にする（受付を止めた窓口では新しく作らない）。
drop function if exists ensure_customer_for_org(uuid);
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
        'はじめまして、中央秘書事務所です。' || chr(10) ||
        'ご用件はお気軽にチャットでお送りください。' || chr(10) || chr(10) ||
        '例' || chr(10) ||
        '「会食のお店を調べて予約してほしい」' || chr(10) ||
        '「出張の手配をお願いしたい」' || chr(10) ||
        '「タスク管理やスケジュール管理をお願いしたい」' || chr(10) ||
        'など、どんなことでもご相談ください。'
    end
  );

  return result_id;
end $$;
grant execute on function ensure_customer_for_org(uuid, uuid) to authenticated;

-- 窓口のトークは最初から分けて作るので、あとから印を付ける仕組みはもう使わない。
drop function if exists claim_desk_thread(uuid);
