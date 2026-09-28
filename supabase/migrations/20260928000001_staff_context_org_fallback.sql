-- 複数タブで別の事業者に切り替えた直後など、staff_org_id Cookie（x-vid-org
-- ヘッダー）が「今のログインが権限を持たない事業者」を指してしまうことがある。
-- 今までは auth_role() が null になり、そのまま「権限がありません」で問答無用に
-- ログアウト画面になっていた。auth_org()/ヘッダーを一切見ず、ログイン本人の
-- profiles.org_id だけで事業者を解決する関数を用意し、staff_context() が
-- 失敗したときのフォールバック先として使う（アプリ側 getStaffContext() で使用）。
create or replace function staff_context_for_own_org() returns table(
  org_id uuid, org_display_name text, solo boolean, is_hq boolean, role app_role, display_name text,
  plan_status plan_status, trial_ends_on date
)
language sql stable security definer set search_path = public as $$
  select o.id, o.display_name, o.solo, o.is_hq, p.role, p.display_name,
    o.plan_status, o.trial_ends_on
  from profiles p
  join organizations o on o.id = p.org_id
  where p.id = auth.uid()
$$;
grant execute on function staff_context_for_own_org() to authenticated;
