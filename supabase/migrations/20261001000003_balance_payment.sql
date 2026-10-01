-- チャージ残高での支払いを案件の正式な支払いタイミングとして追加する。
-- 依頼主が見積もりカードから直接「残高から支払う」を押すと、支払いと
-- 着手が同時に完了する（スタッフの入金確認を待たない）。
alter type payment_timing add value if not exists 'balance';

-- 残高からの支払い。二重消費を防ぐため、依頼主の残高行をロックしてから
-- チェック・差し引き・案件の着手処理までを1つのトランザクションで行う。
-- auth.uid() が実際にこの依頼の依頼主本人であることをここで検証するので、
-- 呼び出し側（依頼主アプリ）は request_id を渡すだけでよい。
create or replace function pay_request_from_balance(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_customer_id uuid;
  v_org_id uuid;
  v_amount integer;
  v_lead_hours integer;
  v_balance integer;
  v_now timestamptz := now();
begin
  select customer_id into v_customer_id from requests where id = p_request_id;
  if v_customer_id is null or not exists (select 1 from customers where id = v_customer_id and profile_id = auth.uid()) then
    raise exception '権限がありません';
  end if;

  -- 残高行をロックして、同時に2回支払われることを防ぐ。
  select balance into v_balance from customers where id = v_customer_id for update;

  select amount, lead_hours, org_id into v_amount, v_lead_hours, v_org_id
  from requests
  where id = p_request_id and customer_id = v_customer_id and phase = 'quoted' and payment_timing = 'balance'
  for update;

  if v_amount is null then
    raise exception '支払いできる状態ではありません';
  end if;
  if v_balance < v_amount then
    raise exception '残高が不足しています';
  end if;

  update customers set balance = balance - v_amount where id = v_customer_id;
  insert into customer_balance_transactions (customer_id, org_id, amount, kind, request_id)
  values (v_customer_id, v_org_id, -v_amount, 'deduction', p_request_id);

  update requests
  set
    phase = 'started',
    started_at = v_now,
    accepted_at = v_now,
    due_at = case when v_lead_hours is not null then v_now + (v_lead_hours || ' hours')::interval else null end,
    pay_status = 'paid',
    paid_at = v_now
  where id = p_request_id;
end $$;
grant execute on function pay_request_from_balance(uuid) to authenticated;

-- 時間精算案件（hourly_rate が設定されている案件）の完了報告が確定した
-- タイミングで呼ぶ。着手〜完了の経過時間を30分単位に切り上げ、時間単価を
-- 掛けて実額を出し、最低3,000円・見積もり時の上限額でクリップする。
-- 見積もり受諾時点では上限額をそのまま引き落としているので、実額との
-- 差額をチャージ残高に戻す（現金での返金はしない）。固定額案件（hourly_rate
-- が null）では何もしない。
create or replace function finalize_hourly_billing(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_rate integer;
  v_cap integer;
  v_started timestamptz;
  v_completed timestamptz;
  v_customer_id uuid;
  v_org_id uuid;
  v_old_amount integer;
  v_minutes numeric;
  v_actual integer;
  v_final integer;
  v_diff integer;
begin
  select hourly_rate, hourly_cap, started_at, completed_at, customer_id, org_id, amount
  into v_rate, v_cap, v_started, v_completed, v_customer_id, v_org_id, v_old_amount
  from requests where id = p_request_id;

  if v_rate is null or v_started is null then
    return;
  end if;

  v_minutes := ceil(extract(epoch from (coalesce(v_completed, now()) - v_started)) / 60.0 / 30.0) * 30;
  v_actual := greatest(3000, round(v_minutes / 60.0 * v_rate));
  v_final := least(v_actual, coalesce(v_cap, v_actual));
  v_diff := v_old_amount - v_final;

  update requests set amount = v_final where id = p_request_id;

  if v_diff > 0 then
    update customers set balance = balance + v_diff where id = v_customer_id;
    insert into customer_balance_transactions (customer_id, org_id, amount, kind, request_id)
    values (v_customer_id, v_org_id, v_diff, 'refund_credit', p_request_id);
  end if;
end $$;
grant execute on function finalize_hourly_billing(uuid) to authenticated;
