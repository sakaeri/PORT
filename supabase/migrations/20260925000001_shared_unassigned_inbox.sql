-- 「窓口未設定のトークはオーナー・統括担当にしか見えない」という前回の
-- 制限が、結局オーナーが毎回振り分けないといけないボトルネックになって
-- いた。未割り当てのトークは、どの窓口担当（マネージャー）からも見えて
-- 拾える「共有の受け皿」に戻す。ただし既にどこかの窓口に割り当て済みの
-- トークは、今まで通りその窓口の担当者にしか見えない（他窓口の覗き見
-- 防止はそのまま）。スタッフ（dept_leader）はここでも対象外
-- （依頼主とは直接やり取りしない役割のため）。
create or replace function department_visible(dept_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    auth_role() in ('owner','reception','supervisor')
    or (auth_role() = 'dept_manager' and (
      dept_id is null
      or exists (select 1 from staff_departments sd where sd.profile_id = auth.uid() and sd.department_id = dept_id)
    ))
$$;

-- 話の途中で担当窓口を変える操作（人間秘書の担当交代と同じ発想）は、
-- 「今見えている（自分の窓口 or 未割り当て）トークを、どの窓口にでも
-- 移せる」ようにする。マネージャーが「これは経理の話なので経理窓口へ」
-- と、自分が所属していない窓口へも投げられるようにするため、移動先の
-- 制限は付けない（USING側で"今見えているものだけ触れる"はそのまま）。
drop policy if exists threads_office_write on threads;
create policy threads_office_write on threads for all using (
  org_id = auth_org() and (
    (kind = 'customer' and is_office() and department_visible(department_id))
    or (kind = 'case' and is_office() and case_visible(customer_id, request_id))
    or (kind = 'internal' and is_office() and (staff_profile_id = auth.uid() or auth_role() in ('owner','supervisor')))
  )
) with check (
  org_id = auth_org() and (
    (kind = 'customer' and is_office())
    or (kind = 'case' and is_office() and case_visible(customer_id, request_id))
    or (kind = 'internal' and is_office() and (staff_profile_id = auth.uid() or auth_role() in ('owner','supervisor')))
  )
);
