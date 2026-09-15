-- カード決済のリンクは事業所ごとの単一デフォルトではなく、見積作成のたびに入力し、
-- 使ったリンクは一覧に残る形にする（URLそのものは後から編集不可、タイトル変更・削除のみ可）。

alter table organizations drop column card_payment_link;

create table card_payment_links (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  title      text not null,
  url        text not null,
  created_at timestamptz not null default now()
);
create index on card_payment_links (org_id, created_at desc);

alter table card_payment_links enable row level security;

create policy card_payment_links_read on card_payment_links for select using (
  org_id = auth_org() and is_office()
);
create policy card_payment_links_write on card_payment_links for all using (
  org_id = auth_org() and is_office()
);
