-- 20260924000002_departments_and_roles.sql を先に実行してから、これを実行すること。
--
-- 「窓口（部署）」機能：受付メニューをグループ化し、担当スタッフを割り当てる
-- ための単位。オーナー・統括担当は全窓口を見渡せ、窓口マネージャー・窓口
-- リーダーは自分の窓口だけを見る想定（実際の閲覧範囲の絞り込みは次の段階
-- で対応する。ここでは「窓口」を作れるようにし、スタッフに役職・担当窓口
-- を割り当てられるようにするところまで）。
create table departments (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index on departments (org_id);
alter table departments enable row level security;

alter table menus add column if not exists department_id uuid references departments(id) on delete set null;
alter table profiles add column if not exists department_id uuid references departments(id) on delete set null;

-- is_office() はRLS全体で「スタッフとして事業者のデータにアクセスできるか」
-- の判定に使われている（61箇所）。新しい3ロールもここに含めることで、
-- 閲覧範囲を窓口単位に絞る作り込みをする前でも、ひとまずアプリに入れる
-- ようにする。窓口単位の絞り込みは次の段階で is_office() の利用箇所を
-- 見直して対応する。
create or replace function is_office() returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() in ('owner','reception','supervisor','dept_manager','dept_leader')
$$;

drop policy if exists departments_read on departments;
create policy departments_read on departments for select using (org_id = auth_org() and is_office());

-- 作成・変更はオーナー・統括担当。削除（＝オーナーのみ、という設計）は
-- 別ポリシーにして統括担当を明示的に外している。
drop policy if exists departments_write on departments;
drop policy if exists departments_insert on departments;
drop policy if exists departments_update on departments;
drop policy if exists departments_delete on departments;
create policy departments_insert on departments for insert with check (
  org_id = auth_org() and auth_role() in ('owner','supervisor')
);
create policy departments_update on departments for update using (
  org_id = auth_org() and auth_role() in ('owner','supervisor')
) with check (
  org_id = auth_org() and auth_role() in ('owner','supervisor')
);
create policy departments_delete on departments for delete using (
  org_id = auth_org() and auth_role() = 'owner'
);

-- staff_context() に department_id を含める（自分の担当窓口を把握するため）。
drop function if exists staff_context();
create or replace function staff_context() returns table(
  org_id uuid, org_display_name text, solo boolean, is_hq boolean, role app_role, department_id uuid, display_name text,
  plan_status plan_status, trial_ends_on date
)
language sql stable security definer set search_path = public as $$
  select o.id, o.display_name, o.solo, o.is_hq, auth_role(),
    (select p.department_id from profiles p where p.id = auth.uid() and p.org_id = auth_org()),
    coalesce(
      (select p.display_name from profiles p where p.id = auth.uid() and p.org_id = auth_org()),
      (select l.display_name from staff_org_links l where l.user_id = auth.uid() and l.org_id = auth_org())
    ),
    o.plan_status, o.trial_ends_on
  from organizations o where o.id = auth_org()
$$;
grant execute on function staff_context() to authenticated;

-- my_staff_orgs() も新しい3ロールを含める。これがないと、統括担当・
-- 窓口マネージャー・窓口リーダーでログインした人の窓口切替メニューが
-- 空になってしまう（自分の所属先すら出ない）。
create or replace function my_staff_orgs() returns table(org_id uuid, role app_role, display_name text, is_primary boolean, slug text)
language sql stable security definer set search_path = public as $$
  select p.org_id, p.role, o.display_name, true as is_primary, o.slug
  from profiles p
  join organizations o on o.id = p.org_id
  where p.id = auth.uid() and p.role in ('owner','reception','supervisor','dept_manager','dept_leader')
  union all
  select l.org_id, l.role, o.display_name, false as is_primary, o.slug
  from staff_org_links l
  join organizations o on o.id = l.org_id
  where l.user_id = auth.uid()
$$;
