-- 窓口切替メニュー・窓口整理ダイアログで、追加した事業者の依頼主用URL
-- （organizations.slug）をいつでも確認できるようにするため、
-- my_staff_orgs() の返り値に slug を追加する。列構成が変わるため
-- create or replace では済まず、先に drop する必要がある。
drop function if exists my_staff_orgs();
create function my_staff_orgs() returns table(org_id uuid, role app_role, display_name text, is_primary boolean, slug text)
language sql stable security definer set search_path = public as $$
  select p.org_id, p.role, o.display_name, true as is_primary, o.slug
  from profiles p
  join organizations o on o.id = p.org_id
  where p.id = auth.uid() and p.role in ('owner','reception')
  union all
  select l.org_id, l.role, o.display_name, false as is_primary, o.slug
  from staff_org_links l
  join organizations o on o.id = l.org_id
  where l.user_id = auth.uid()
$$;
