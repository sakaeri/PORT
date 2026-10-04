-- 完了報告の定型項目（report_field_presets）を事業者単位ではなく、
-- メニュー単位に変える。メニューによって報告すべき内容は違う
-- （「はじめの質問」が menu_questions でメニュー単位なのと同じ考え方）。
alter table report_field_presets add column menu_id uuid references menus(id) on delete cascade;
-- 以降の一時的な引き継ぎ用insertでは org_id を埋めないため、先にNOT NULL制約を外す
-- （org_id 自体はこのあとすぐ列ごと削除する）。
alter table report_field_presets alter column org_id drop not null;

-- 既存の事業者単位のプリセットは、その事業者の全メニューに複製して引き継ぐ
-- （何も失われないようにするため）。
insert into report_field_presets (menu_id, label, sort)
select m.id, p.label, p.sort
from report_field_presets p
join menus m on m.org_id = p.org_id
where p.menu_id is null;

delete from report_field_presets where menu_id is null;
alter table report_field_presets alter column menu_id set not null;
alter table report_field_presets drop column org_id;

create index on report_field_presets (menu_id, sort);

drop policy if exists report_field_presets_office on report_field_presets;
create policy report_field_presets_read on report_field_presets for select using (
  exists (select 1 from menus m where m.id = menu_id and m.org_id = auth_org())
);
create policy report_field_presets_write on report_field_presets for all using (
  exists (select 1 from menus m where m.id = menu_id and m.org_id = auth_org()) and is_office()
);
