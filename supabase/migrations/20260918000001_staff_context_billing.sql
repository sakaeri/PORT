-- セルフサインアップ後のトライアル終了で書き込み系をソフトロックするために、
-- 受付アプリ側の staff_context() に事業者の契約状態を含める。
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
