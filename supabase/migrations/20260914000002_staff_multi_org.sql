-- 1つのスタッフログインが複数の事業者（窓口）を兼任できるようにする。
-- profiles は「1ログイン=1事業者」の前提（id が主キー）のまま変更しない
-- （creators.profile_id や messages.sender_id など、既存の全FKに影響を
-- 出さないため）。追加の事業者はこの staff_org_links に積む方式にする。
-- 依頼主側の customers/threads の多事業者対応（20260910000003）とは別の、
-- スタッフ専用の仕組み。
create table staff_org_links (
  user_id      uuid not null references auth.users(id) on delete cascade,
  org_id       uuid not null references organizations(id) on delete cascade,
  role         app_role not null default 'owner',
  display_name text not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, org_id)
);
alter table staff_org_links enable row level security;
create policy staff_org_links_self on staff_org_links for select using (user_id = auth.uid());
-- 書き込みはサーバ側（service_role）だけが行う。ユーザーの書き込みポリシーは置かない。

-- auth_role() を「今どの事業者を見ているか」(auth_org()) 基準に書き換える。
-- 今までは1ログイン=1事業者専属だったので org を見ずに済んでいたが、
-- 複数事業者を持てるようになった以上、正しい事業者での役割を返すには
-- auth_org() と突き合わせる必要がある。is_office()/org_write はこの関数を
-- 呼んでいるだけなので、この書き換えだけで両方とも正しく動くようになる。
-- 依頼主（role='client'）は自分のprofiles.org_idが常定の既定事業所のままな
-- ので、既定事業所以外を見ているときはここが null を返すが、is_office() は
-- 元々falseにしかならないため挙動は変わらない。
create or replace function auth_role() returns app_role
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from profiles where id = auth.uid() and org_id = auth_org()),
    (select role from staff_org_links where user_id = auth.uid() and org_id = auth_org())
  )
$$;

-- 受付アプリのサイドバー切替メニュー用：今のログインでアクセスできる
-- 事業者の一覧（本来のプロフィール1件＋追加分）。
create or replace function my_staff_orgs() returns table(org_id uuid, role app_role, display_name text, is_primary boolean)
language sql stable security definer set search_path = public as $$
  select org_id, role, display_name, true as is_primary
  from profiles where id = auth.uid() and role in ('owner','reception')
  union all
  select org_id, role, display_name, false as is_primary
  from staff_org_links where user_id = auth.uid()
$$;
grant execute on function my_staff_orgs() to authenticated;

-- 今アクセス中の事業者（auth_org()）についての表示情報一式。HQ可視化ポリシー
-- のせいで単純な select * from organizations では他事業者も混ざって返って
-- しまうため、security definer で「今の1件だけ」を確実に返す。
create or replace function staff_context() returns table(
  org_id uuid, org_display_name text, solo boolean, is_hq boolean, role app_role, display_name text
)
language sql stable security definer set search_path = public as $$
  select o.id, o.display_name, o.solo, o.is_hq, auth_role(),
    coalesce(
      (select p.display_name from profiles p where p.id = auth.uid() and p.org_id = auth_org()),
      (select l.display_name from staff_org_links l where l.user_id = auth.uid() and l.org_id = auth_org())
    )
  from organizations o where o.id = auth_org()
$$;
grant execute on function staff_context() to authenticated;

-- セキュリティ修正（このスタッフ複数事業者対応のテスト中に発覚）:
-- org_read が「id = auth_org()」だけだったため、x-vid-org ヘッダーを
-- 直接叩けば無関係な事業所の organizations 行（住所・電話・メール・
-- Stripe顧客ID・基本料など）を誰でも読めてしまっていた。今までは
-- ヘッダーが常に「自分が今いる事業所」に一致する経路でしか使われて
-- こなかったため表面化していなかった。実際にその事業所の依頼主か、
-- 受付スタッフかを確認してから読ませるようにする。
drop policy if exists org_read on organizations;
create policy org_read on organizations for select using (
  id = auth_org() and (
    is_office()
    or exists (select 1 from customers c where c.profile_id = auth.uid() and c.org_id = organizations.id)
  )
);
