-- マイページの「この窓口のしくみを、自社でも」→「3ヶ月無料で始める」を押した記録。
-- PORT運営（アプリのオーナー）が Supabase 側で直接確認して連絡するための、
-- ごく単純なリード（見込み客）テーブル。書き込みは Server Action から
-- service-role 経由でのみ行う想定のため、customers 向けの RLS ポリシーは
-- あえて作らない（RLS有効・ポリシーなし＝アプリ側からは常に拒否）。
create table if not exists referral_leads (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  customer_id    uuid not null references customers(id) on delete cascade,
  customer_name  text not null,
  customer_email text,
  created_at     timestamptz not null default now()
);
alter table referral_leads enable row level security;
