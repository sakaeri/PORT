-- 支払い条件（先払い・予約金・発送前入金・後払い）と、
-- 事業所ごとの決済設定（カード決済のON/OFF・銀行振込のデフォルト情報）、
-- 予約金／残金の2段階の着金確認を追加する。
-- 実際のカード決済・銀行振込は連携しない（受付がチャットでリンク・振込先を送り、着金は手動確認する）。

create type payment_timing as enum ('prepay_full', 'deposit', 'before_shipping', 'postpay');

alter table requests
  add column payment_timing payment_timing not null default 'prepay_full',
  add column deposit_percent integer,
  add column deposit_amount integer,
  add column deposit_paid_at timestamptz,
  add column deposit_paid_marked_by uuid references profiles(id),
  add column bank_transfer_info jsonb; -- 見積もり時点の振込先スナップショット（銀行振込を選んだときのみ）

alter table organizations
  add column card_payment_enabled boolean not null default false,
  add column bank_transfer_info jsonb not null default '{}'::jsonb; -- 振込先のデフォルト（次回の見積もりに自動で入る）
