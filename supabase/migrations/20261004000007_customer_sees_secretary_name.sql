-- 依頼主にスタッフの表示名を見せるポリシーが、role の名称変更
-- （reception → dept_manager への移行）に追従できておらず、マネージャー
-- （＝秘書）の表示名を依頼主が読めなかった（チャットで常に「受付」としか
-- 表示できなかった原因）。dept_manager を対象に加える。
drop policy if exists profiles_office_visible_to_customer on profiles;
create policy profiles_office_visible_to_customer on profiles for select using (
  role in ('owner', 'reception', 'dept_manager') and org_id = auth_org()
);
