-- 残高の自動チャージ。依頼主がマイページで任意にオン/オフできる。有効に
-- する操作そのものが、カードを保存しておくことと、残高が一定額を下回った
-- 時に本人の操作なしでそのカードに課金することへの同意を兼ねる。
-- カードの保存はStripe Checkout（setupモード）経由で行い、保存先の
-- stripe_customer_id / stripe_payment_method_id をここに記録する。
alter table customers add column if not exists stripe_customer_id text;
alter table customers add column if not exists stripe_payment_method_id text;
alter table customers add column if not exists auto_recharge_enabled boolean not null default false;
alter table customers add column if not exists auto_recharge_threshold integer;
alter table customers add column if not exists auto_recharge_amount integer;
alter table customers add column if not exists auto_recharge_fail_count integer not null default 0;

-- オフにするのは依頼主自身がいつでもできる。カードの保存情報はそのまま
-- 残すが（再度オンにする時は改めてStripeでカードを確認してもらう設計の
-- ため、実際には使われない）、しきい値等は変えない。
create or replace function disable_auto_recharge() returns void
language plpgsql security definer set search_path = public as $$
begin
  update customers set auto_recharge_enabled = false, auto_recharge_fail_count = 0 where profile_id = auth.uid();
end $$;
grant execute on function disable_auto_recharge() to authenticated;

-- 自動チャージの実際の引き落とし確定（日次バッチ・service roleから呼ぶ）。
-- 二重計上を防ぐため、同じStripeの支払いID（PaymentIntent）につき1回しか
-- 反映しない（customer_balance_transactions.stripe_checkout_session_id を
-- そのままStripe側の参照IDの格納場所として使い回している）。
create or replace function credit_auto_recharge(p_customer_id uuid, p_org_id uuid, p_amount integer, p_stripe_payment_intent_id text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from customer_balance_transactions where stripe_checkout_session_id = p_stripe_payment_intent_id) then
    return false;
  end if;
  update customers set balance = balance + p_amount, auto_recharge_fail_count = 0 where id = p_customer_id;
  insert into customer_balance_transactions (customer_id, org_id, amount, kind, stripe_checkout_session_id)
  values (p_customer_id, p_org_id, p_amount, 'charge', p_stripe_payment_intent_id);
  return true;
end $$;
grant execute on function credit_auto_recharge(uuid, uuid, integer, text) to service_role;

-- 手動チャージのWebhook側で使う、残高への単純な加算。読み出してから書き
-- 戻す方式だと、ほぼ同時に届いた別の入出金と競合して片方が消えることが
-- あるため、DB側で加算させる。
create or replace function increment_customer_balance(p_customer_id uuid, p_amount integer) returns void
language sql security definer set search_path = public as $$
  update customers set balance = balance + p_amount where id = p_customer_id;
$$;
grant execute on function increment_customer_balance(uuid, integer) to service_role;
