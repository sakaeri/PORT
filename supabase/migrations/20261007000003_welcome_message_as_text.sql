-- 最初の案内メッセージを「システムのお知らせ」ではなく「秘書からのメッセージ」
-- の見た目にする。kind を notice から text に変えるだけで、依頼主アプリ側は
-- 左寄せの吹き出しで表示し、担当者名が未アサインのぶん事業所名で名乗る
-- （Bubbles.tsx の Meta コンポーネント参照）。

create or replace function handle_new_customer() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target_org uuid;
  new_customer_id uuid;
  new_thread_id uuid;
begin
  if coalesce(new.is_anonymous, false) is not true then
    return new;
  end if;

  target_org := default_org_id();
  if target_org is null then
    raise exception 'app_config.default_org_id が未設定です';
  end if;

  insert into profiles (id, org_id, role, display_name)
  values (new.id, target_org, 'client', 'ゲスト依頼主')
  on conflict (id) do nothing;

  insert into customers (org_id, profile_id, name, member_no)
  values (target_org, new.id, '未登録の依頼主', null)
  returning id into new_customer_id;

  insert into threads (org_id, kind, customer_id, last_msg_at)
  values (target_org, 'customer', new_customer_id, now())
  returning id into new_thread_id;

  insert into messages (thread_id, sender_id, sender_role, kind, body)
  values (
    new_thread_id, null, null, 'text',
    'はじめまして、中央秘書事務所です。' || chr(10) ||
    'ご用件はお気軽にチャットでお送りください。' || chr(10) || chr(10) ||
    '例' || chr(10) ||
    '「会食のお店を調べて予約してほしい」' || chr(10) ||
    '「出張の手配をお願いしたい」' || chr(10) ||
    '「タスク管理やスケジュール管理をお願いしたい」' || chr(10) ||
    'など、どんなことでもご相談ください。'
  );

  return new;
end $$;

create or replace function ensure_customer_for_org(p_org_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  result_id uuid;
  new_thread_id uuid;
begin
  select id into result_id from customers where profile_id = auth.uid() and org_id = p_org_id;
  if result_id is not null then
    return result_id;
  end if;

  insert into customers (org_id, profile_id, name, member_no)
  values (p_org_id, auth.uid(), '未登録の依頼主', null)
  on conflict (profile_id, org_id) do nothing
  returning id into result_id;

  if result_id is null then
    select id into result_id from customers where profile_id = auth.uid() and org_id = p_org_id;
  else
    insert into threads (org_id, kind, customer_id, last_msg_at)
    values (p_org_id, 'customer', result_id, now())
    returning id into new_thread_id;

    insert into messages (thread_id, sender_id, sender_role, kind, body)
    values (
      new_thread_id, null, null, 'text',
      'はじめまして、中央秘書事務所です。' || chr(10) ||
      'ご用件はお気軽にチャットでお送りください。' || chr(10) || chr(10) ||
      '例' || chr(10) ||
      '「会食のお店を調べて予約してほしい」' || chr(10) ||
      '「出張の手配をお願いしたい」' || chr(10) ||
      '「タスク管理やスケジュール管理をお願いしたい」' || chr(10) ||
      'など、どんなことでもご相談ください。'
    );
  end if;

  return result_id;
end $$;
grant execute on function ensure_customer_for_org(uuid) to authenticated;
