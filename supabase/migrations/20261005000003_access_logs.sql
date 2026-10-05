-- トラブル対応（スタッフによる情報の不適切な閲覧など）があった時に、
-- 「誰が・いつ・どの依頼主の情報を見たか」を後から調べられるようにする
-- ための閲覧履歴。書き込みは本人の分だけ、読み取りは本部（owner）のみ。
create table access_logs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  actor_id    uuid references profiles(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  request_id  uuid references requests(id) on delete set null,
  action      text not null,
  created_at  timestamptz not null default now()
);
create index on access_logs (org_id, customer_id, created_at);
create index on access_logs (org_id, actor_id, created_at);

alter table access_logs enable row level security;

create policy access_logs_write on access_logs for insert with check (
  org_id = auth_org() and actor_id = auth.uid() and is_office()
);
create policy access_logs_read on access_logs for select using (
  org_id = auth_org() and auth_role() = 'owner'
);
