-- 窓口（秘書）未設定の依頼主トークを、本部（オーナー・受付）だけに見えるようにする。
-- 20260925000001 で「どの秘書からも見える共有の受け皿」にしていたが、秘書には
-- 自分の窓口に割り当てられた依頼主だけを見せる方針に戻す（未設定の依頼主は
-- 本部が担当窓口を割り当てる）。スタッフ（dept_leader）は今まで通り対象外。
create or replace function department_visible(dept_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    auth_role() in ('owner','reception')
    or (auth_role() = 'dept_manager' and dept_id is not null and exists (
      select 1 from staff_departments sd where sd.profile_id = auth.uid() and sd.department_id = dept_id
    ))
$$;
