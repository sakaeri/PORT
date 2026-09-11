-- agreement_extras には元々 SELECT のみのポリシー（ag_extras_read）しかなく、
-- 受付が条項を追加・編集・削除できなかった（メニュー管理の契約書テンプレート機能を
-- 実装中に発見）。同じ事業所の受付（owner/reception）に書き込みを許可する。
create policy ag_extras_office_write on agreement_extras for all using (
  exists (select 1 from agreements a where a.id = agreement_id and a.org_id = auth_org() and is_office())
) with check (
  exists (select 1 from agreements a where a.id = agreement_id and a.org_id = auth_org() and is_office())
);
