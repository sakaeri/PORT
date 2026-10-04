-- 完了報告の「納品物」「受け渡し方法」が画面に決め打ちだった。何を
-- 報告すべきか迷わないための定型的な項目名は残しつつ、自由に項目を
-- 追加・変更できるようにするため、よく使う項目名（プリセット）を
-- 事業者ごとに持たせる。completion_reports.details は元々
-- [{label, value}] の自由な配列なので、画面側をこのプリセットから
-- 選べる形に変えるだけで対応できる。
create table report_field_presets (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  label      text not null,
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);
create index on report_field_presets (org_id, sort);

alter table report_field_presets enable row level security;
create policy report_field_presets_office on report_field_presets for all using (
  org_id = auth_org() and is_office()
);

-- 既存の事業者にも、今まで決め打ちだった2項目をそのままプリセットとして
-- 入れておく（今後作る事業者には createOrgRow 側で同じものを入れる）。
insert into report_field_presets (org_id, label, sort)
select o.id, v.label, v.sort
from organizations o
cross join (values ('納品物', 0), ('受け渡し方法', 1)) as v(label, sort)
where not exists (select 1 from report_field_presets p where p.org_id = o.id);
