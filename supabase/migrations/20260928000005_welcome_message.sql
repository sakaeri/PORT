-- 依頼主向けの「メニューから問い合わせる」を廃止するのに合わせて、代わりに
-- 最初のスレッド作成時（＝この依頼主が初めてこの事業者と繋がった瞬間）に
-- 案内の定型メッセージを1通自動で流す。kind='notice' は案件スレッドの
-- postCaseNotice と同じ、システム発言（sender_id/sender_role は null）の扱い。

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
    new_thread_id, null, null, 'notice',
    'はじめまして。ご用件はお気軽にチャットでお送りください。' || chr(10) ||
    '例：「会食のお店を予約してほしい」「出張の手配をお願いしたい」など、どんなことでもご相談だけで大丈夫です。'
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
      new_thread_id, null, null, 'notice',
      'はじめまして。ご用件はお気軽にチャットでお送りください。' || chr(10) ||
      '例：「会食のお店を予約してほしい」「出張の手配をお願いしたい」など、どんなことでもご相談だけで大丈夫です。'
    );
  end if;

  return result_id;
end $$;
grant execute on function ensure_customer_for_org(uuid) to authenticated;
