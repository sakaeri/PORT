-- 会員番号(member_no)の発番を「初回の本当のメッセージ送信時」まで遅らせる。
-- 今までは匿名セッションが作られただけ（ページを開いただけ）で番号を1つ消費していたため、
-- 実際には問い合わせていない人の分まで番号が異様に増えていた。
--
-- 方針:
--   1) customers 行を作る2箇所（匿名サインイン時のトリガー / 事業所切替時の ensure_customer_for_org）
--      では member_no を NULL のまま作る（member_no は元々 unique だが NULL は何個あっても衝突しない）。
--   2) messages に「依頼主本人からの」行（sender_role = 'client'）が初めて入ったタイミングで、
--      その依頼主の member_no が NULL ならその場で採番する trigger を追加する。
--      これで「本当に問い合わせた人」だけが番号を持つようになる。
--   3) 既存データの掃除として、今までに一度もメッセージを送っていない依頼主（＝上の理由で
--      無駄に作られた行）をこのタイミングで一括削除する（一度きりの掃除。cascade で
--      関連する空のスレッド等も一緒に消える）。

-- ============================================================
-- 1. 依頼主行の新規作成では member_no を発番しない
-- ============================================================
create or replace function handle_new_customer() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target_org uuid;
  new_customer_id uuid;
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
  values (target_org, 'customer', new_customer_id, now());

  return new;
end $$;

create or replace function ensure_customer_for_org(p_org_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  result_id uuid;
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
    values (p_org_id, 'customer', result_id, now());
  end if;

  return result_id;
end $$;
grant execute on function ensure_customer_for_org(uuid) to authenticated;

-- ============================================================
-- 2. 依頼主本人からの初回メッセージで採番する trigger
-- ============================================================
create or replace function assign_member_no_on_first_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sender_role = 'client' then
    update customers c
    set member_no = 'C-' || lpad(nextval('customer_no_seq')::text, 6, '0')
    from threads t
    where t.id = new.thread_id
      and t.customer_id = c.id
      and c.member_no is null;
  end if;
  return new;
end $$;

drop trigger if exists on_message_assign_member_no on messages;
create trigger on_message_assign_member_no
  after insert on messages
  for each row execute function assign_member_no_on_first_message();

-- ============================================================
-- 3. 一度きりの掃除: 一度もメッセージを送っていない依頼主を削除
--    （cascade で空のスレッド・vault等も一緒に消える）
-- ============================================================
delete from customers c
where c.member_no is null
  and not exists (
    select 1 from threads t join messages m on m.thread_id = t.id where t.customer_id = c.id
  );
