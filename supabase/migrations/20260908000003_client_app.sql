-- VID-client 実装のための追加分
-- 1) 匿名サインインだけで依頼主として使い始められるようにする（サインアップ画面を作らない）
-- 2) messages の RLS がスレッド存在チェックのみだったのを、スレッドの可視範囲と揃える
-- 3) message_kind に menu_pick（メニューから問い合わせる、で送るカード）を追加
-- 4) 添付ファイル（画像のみ）用の Storage バケットと RLS

-- ============================================================
-- 0. 単一事業所（このアプリを使う事業所）を指す設定
-- ============================================================
create table if not exists app_config (
  id             boolean primary key default true check (id),  -- 常に1行だけ
  default_org_id uuid references organizations(id)
);
insert into app_config (id) values (true) on conflict (id) do nothing;

create or replace function default_org_id() returns uuid language sql stable as $$
  select default_org_id from app_config limit 1
$$;

create sequence if not exists customer_no_seq start 1;

-- ============================================================
-- 1. 匿名サインイン → profiles / customers / threads(customer) を自動作成
-- ============================================================
create or replace function handle_new_customer() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target_org uuid;
  new_customer_id uuid;
begin
  if coalesce(new.is_anonymous, false) is not true then
    return new; -- スタッフ等の通常アカウントはここでは作らない（別途 admin が作成）
  end if;

  target_org := default_org_id();
  if target_org is null then
    raise exception 'app_config.default_org_id が未設定です';
  end if;

  insert into profiles (id, org_id, role, display_name)
  values (new.id, target_org, 'client', 'ゲスト依頼主')
  on conflict (id) do nothing;

  insert into customers (org_id, profile_id, name, member_no)
  values (target_org, new.id, '未登録の依頼主', 'C-' || lpad(nextval('customer_no_seq')::text, 6, '0'))
  returning id into new_customer_id;

  insert into threads (org_id, kind, customer_id, last_msg_at)
  values (target_org, 'customer', new_customer_id, now());

  return new;
end $$;

drop trigger if exists on_auth_user_created_customer on auth.users;
create trigger on_auth_user_created_customer
  after insert on auth.users
  for each row execute function handle_new_customer();

-- ============================================================
-- 2. message_kind に menu_pick を追加（メニューから問い合わせる、の送信カード）
-- ============================================================
alter type message_kind add value if not exists 'menu_pick';

-- ============================================================
-- 3. messages の RLS を threads_read と同じ可視範囲に締める
--    (元のポリシーは「スレッドが存在すること」しか見ておらず、
--     他人のスレッドにも書き込める/読める抜け穴があったため修正)
-- ============================================================
drop policy if exists messages_read on messages;
create policy messages_read on messages for select using (
  exists (
    select 1 from threads t
    where t.id = messages.thread_id
      and t.org_id = auth_org()
      and (
        is_office()
        or (t.kind = 'customer' and t.customer_id = my_customer_id())
        or (t.kind in ('case','internal') and (
              t.creator_id = my_creator_id()
              or exists (select 1 from requests r where r.id = t.request_id and r.creator_id = my_creator_id())
        ))
      )
  )
);

drop policy if exists messages_send on messages;
create policy messages_send on messages for insert with check (
  sender_id = auth.uid()
  and exists (
    select 1 from threads t
    where t.id = messages.thread_id
      and t.org_id = auth_org()
      and (
        is_office()
        or (t.kind = 'customer' and t.customer_id = my_customer_id())
        or (t.kind in ('case','internal') and (
              t.creator_id = my_creator_id()
              or exists (select 1 from requests r where r.id = t.request_id and r.creator_id = my_creator_id())
        ))
      )
  )
);

-- customers 自身の見積り承諾・キャンセル・入金確定は Next.js の service-role API から行う
-- （RLS で customer に requests の update 権限を与えない。金額を動かす操作を
--   ブラウザ側の直接書き込みにしないため）。

-- 依頼主自身によるお名前の設定は「決済前の初回登録」の1回だけ許可する。
-- 一度でも本名が入ったら（プレースホルダーでなくなったら）以降は自分では書けなくなり、
-- 「変更を依頼」（トーク経由で受付に依頼）に切り替わる。書類の宛名が勝手に動かないようにするため。
create policy customers_self_set_name_once on customers for update
  using (profile_id = auth.uid() and name = '未登録の依頼主')
  with check (profile_id = auth.uid());

-- 受付の表示名（「受付 佐藤」等）は依頼主にも見えてよい低感度の情報。
-- 元の profiles_self ポリシーは「自分の行 or 自分が受付」だけを許可しており、
-- 依頼主からは受付の名前すら引けなかったため追加する。
create policy profiles_office_visible_to_customer on profiles for select using (
  role in ('owner', 'reception') and org_id = auth_org()
);

-- ============================================================
-- 4. 添付（画像のみ）用の Storage バケット
-- ============================================================
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- パスは "<thread_id>/<uuid>-<filename>" とし、そのスレッドを読める人だけが読み書きできる
drop policy if exists attachments_read on storage.objects;
create policy attachments_read on storage.objects for select using (
  bucket_id = 'attachments'
  and exists (
    select 1 from threads t
    where t.id::text = (storage.foldername(name))[1]
      and t.org_id = auth_org()
      and (
        is_office()
        or (t.kind = 'customer' and t.customer_id = my_customer_id())
        or (t.kind in ('case','internal') and (
              t.creator_id = my_creator_id()
              or exists (select 1 from requests r where r.id = t.request_id and r.creator_id = my_creator_id())
        ))
      )
  )
);

drop policy if exists attachments_write on storage.objects;
create policy attachments_write on storage.objects for insert with check (
  bucket_id = 'attachments'
  and exists (
    select 1 from threads t
    where t.id::text = (storage.foldername(name))[1]
      and t.org_id = auth_org()
      and (
        is_office()
        or (t.kind = 'customer' and t.customer_id = my_customer_id())
      )
  )
);
