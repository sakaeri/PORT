-- my_staff_orgs() は受付アプリの窓口切替メニューのラベルに使われるが、
-- 前回のSQLでは各行のスタッフ本人の表示名（例：「PORT本部」という
-- 個人の呼び方）を返していた。切替メニューに出したいのは、その事業所
-- 自体の表示名（organizations.display_name）なので、そちらを返すように直す。
create or replace function my_staff_orgs() returns table(org_id uuid, role app_role, display_name text, is_primary boolean)
language sql stable security definer set search_path = public as $$
  select p.org_id, p.role, o.display_name, true as is_primary
  from profiles p
  join organizations o on o.id = p.org_id
  where p.id = auth.uid() and p.role in ('owner','reception')
  union all
  select l.org_id, l.role, o.display_name, false as is_primary
  from staff_org_links l
  join organizations o on o.id = l.org_id
  where l.user_id = auth.uid()
$$;
