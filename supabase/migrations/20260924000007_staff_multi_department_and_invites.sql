-- ①スタッフ1人が複数の窓口を掛け持ちできるようにする。
-- 「イベントとシフト管理を兼任するAさん」のような実際の運用に対応するため、
-- profiles.department_id（1人につき窓口1つ）を廃止し、多対多の
-- staff_departments テーブルに置き換える。

create table if not exists staff_departments (
  profile_id uuid not null references profiles(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  primary key (profile_id, department_id)
);
alter table staff_departments enable row level security;

create policy staff_departments_read on staff_departments for select using (
  exists (select 1 from profiles p where p.id = staff_departments.profile_id and p.org_id = auth_org() and is_office())
);
create policy staff_departments_write on staff_departments for all using (
  auth_role() in ('owner','supervisor')
  and exists (select 1 from profiles p where p.id = staff_departments.profile_id and p.org_id = auth_org())
);

-- 既存の「1人1窓口」のデータを移行してからカラムを削除。
insert into staff_departments (profile_id, department_id)
select id, department_id from profiles where department_id is not null
on conflict do nothing;

alter table profiles drop column if exists department_id;

create or replace function department_visible(dept_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    auth_role() in ('owner','reception','supervisor')
    or (dept_id is not null and exists (
      select 1 from staff_departments sd where sd.profile_id = auth.uid() and sd.department_id = dept_id
    ))
$$;

-- staff_context() は department_id を返していたが、アプリ側では使っておらず
-- （実際に絞り込みに使うのは department_visible() 経由のRLSだけ）、そもそも
-- 複数窓口になったので単一の値では表現できない。取り除く。
drop function if exists staff_context();
create or replace function staff_context() returns table(
  org_id uuid, org_display_name text, solo boolean, is_hq boolean, role app_role, display_name text,
  plan_status plan_status, trial_ends_on date
)
language sql stable security definer set search_path = public as $$
  select o.id, o.display_name, o.solo, o.is_hq, auth_role(),
    coalesce(
      (select p.display_name from profiles p where p.id = auth.uid() and p.org_id = auth_org()),
      (select l.display_name from staff_org_links l where l.user_id = auth.uid() and l.org_id = auth_org())
    ),
    o.plan_status, o.trial_ends_on
  from organizations o where o.id = auth_org()
$$;
grant execute on function staff_context() to authenticated;

-- ②スタッフ招待をメール・パスワードの手入力からリンク発行に変更する。
-- オーナー・統括担当が役職と担当窓口を決めて招待リンクを作り、招待された
-- 本人が /join/<id> を開いて自分でログイン情報を設定する（セルフサインアップの
-- signUpSelfServe と同じ考え方）。

create table if not exists staff_invites (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  role         app_role not null,
  department_ids uuid[] not null default '{}',
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  used_at      timestamptz,
  used_by      uuid references profiles(id) on delete set null
);
alter table staff_invites enable row level security;

-- 招待リンクを開いた本人はまだ未ログインなので、一覧の作成・閲覧・削除は
-- オーナー・統括担当だけに絞る。招待の消費（/join）はservice roleで行うため
-- ここにポリシーは不要。
create policy staff_invites_manage on staff_invites for all using (
  org_id = auth_org() and auth_role() in ('owner','supervisor')
);
