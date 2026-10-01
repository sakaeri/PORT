-- チャージ残高制度。依頼主は事前にチャージしておき、案件の代金はそこから
-- 消費する（都度払いをやめる）。残高そのものは customers.balance に持ち、
-- 入出金はすべて customer_balance_transactions に記録して監査できるようにする。
alter table customers add column if not exists balance integer not null default 0;

create table customer_balance_transactions (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  org_id      uuid not null references organizations(id) on delete cascade,
  -- 正: チャージ（入金・返金クレジット）／ 負: 消費（案件代金の引き落とし）
  amount      integer not null,
  kind        text not null check (kind in ('charge', 'deduction', 'refund_credit')),
  request_id  uuid references requests(id) on delete set null,
  stripe_checkout_session_id text,
  created_at  timestamptz not null default now()
);
create index on customer_balance_transactions (customer_id, created_at desc);
alter table customer_balance_transactions enable row level security;

create policy balance_tx_read_own on customer_balance_transactions for select using (
  customer_id = my_customer_id()
);
create policy balance_tx_read_office on customer_balance_transactions for select using (
  exists (select 1 from customers c where c.id = customer_id and c.org_id = auth_org() and is_office())
);

-- 時間精算の案件用。menuに無い依頼で、時間単価×実働時間（着手〜完了報告、
-- 30分単位切り上げ、最低3,000円）で請求額を決める。hourly_rate が null な
-- 案件は今まで通りの固定額。hourly_cap は依頼主に提示する上限額（これ以上は
-- 請求しない）で、合意の目安として見積もり時の amount に入れておく。
alter table requests add column if not exists hourly_rate integer;
alter table requests add column if not exists hourly_cap integer;
