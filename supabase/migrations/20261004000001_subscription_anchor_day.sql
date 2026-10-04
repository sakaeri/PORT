-- 定期対応（毎週・毎月）に「曜日・日付の指定」を追加する。これまでは
-- 「初回決済した日」からの単純な+7日／+1ヶ月でしか計算できず、
-- 「毎週月曜に報告」「毎月25日までに」のような固定の曜日・日付指定に
-- 対応できなかった。指定が無ければ今まで通りの動きのまま。
--
-- anchor_weekday: 0=日,1=月,...,6=土（extract(dow from ...)と同じ並び）。毎週のみ。
-- anchor_day_of_month: 1〜28。月末日のズレを避けるため29以降は指定不可。毎月のみ。
--
-- 指定がある場合、初回の周期日（next_due_at）だけその曜日・日付に
-- 揃える。2回目以降は今まで通り+7日／+1ヶ月で進めれば、曜日・日付は
-- 自動的にそのまま維持される。
alter table request_subscriptions add column if not exists anchor_weekday smallint check (anchor_weekday between 0 and 6);
alter table request_subscriptions add column if not exists anchor_day_of_month smallint check (anchor_day_of_month between 1 and 28);

-- あわせて、定期対応から生まれる案件には納期目安（due_at）が一度も
-- 設定されていなかった（着手時に lead_hours から計算する通常の依頼とは
-- 違い、定期対応は lead_hours を使わないため）。そのせいで「案件トーク」の
-- 納期超過・残りわずかの警告が定期対応では一切出ない状態だった。
-- 次回の周期日（next_due_at）をそのまま due_at として使うことで、
-- 曜日・日付指定の有無に関わらず警告が機能するようにする。
create or replace function pay_request_from_balance(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_customer_id uuid;
  v_org_id uuid;
  v_amount integer;
  v_subscription_id uuid;
  v_cadence text;
  v_balance integer;
  v_now timestamptz := now();
  v_sub request_subscriptions%rowtype;
  v_next timestamptz;
begin
  select customer_id into v_customer_id from requests where id = p_request_id;
  if v_customer_id is null or not exists (select 1 from customers where id = v_customer_id and profile_id = auth.uid()) then
    raise exception '権限がありません';
  end if;

  select balance into v_balance from customers where id = v_customer_id for update;

  select amount, org_id, subscription_id, cadence into v_amount, v_org_id, v_subscription_id, v_cadence
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
    phase = 'preparing',
    accepted_at = v_now,
    pay_status = 'paid',
    paid_at = v_now
  where id = p_request_id;

  if v_subscription_id is not null then
    select * into v_sub from request_subscriptions where id = v_subscription_id;

    if v_cadence = 'weekly' and v_sub.anchor_weekday is not null then
      -- 今日より後の、指定した曜日に揃える（今日が指定曜日でも次の週にする）。
      v_next := date_trunc('day', v_now) + ((v_sub.anchor_weekday - extract(dow from v_now)::int + 7) % 7) * interval '1 day';
      if v_next <= v_now then v_next := v_next + interval '7 days'; end if;
    elsif v_cadence = 'monthly' and v_sub.anchor_day_of_month is not null then
      v_next := date_trunc('month', v_now)::date + (v_sub.anchor_day_of_month - 1) * interval '1 day';
      if v_next <= v_now then
        v_next := (date_trunc('month', v_now) + interval '1 month')::date + (v_sub.anchor_day_of_month - 1) * interval '1 day';
      end if;
    else
      v_next := case v_cadence when 'weekly' then v_now + interval '7 days' else v_now + interval '1 month' end;
    end if;

    update request_subscriptions set active = true, next_due_at = v_next where id = v_subscription_id and active = false;
    update requests set due_at = v_next where id = p_request_id;
  end if;
end $$;
grant execute on function pay_request_from_balance(uuid) to authenticated;

create or replace function charge_subscription_occurrence(p_subscription_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_sub request_subscriptions%rowtype;
  v_balance integer;
  v_now timestamptz := now();
  v_request_id uuid;
  v_case_thread_id uuid;
  v_item jsonb;
  v_next timestamptz;
begin
  select * into v_sub from request_subscriptions where id = p_subscription_id and active for update;
  if not found then
    return null;
  end if;

  select balance into v_balance from customers where id = v_sub.customer_id for update;

  if v_balance < v_sub.amount then
    if v_sub.last_insufficient_notice_at is distinct from current_date then
      insert into messages (thread_id, sender_id, sender_role, kind, body)
      values (v_sub.customer_thread_id, null, null, 'notice', '残高不足のため、定期対応（' || v_sub.title || '）の今回分を作成できませんでした。マイページからチャージをお願いします。');
      update threads set last_msg_at = v_now where id = v_sub.customer_thread_id;
      update request_subscriptions set last_insufficient_notice_at = current_date where id = p_subscription_id;
    end if;
    return null;
  end if;

  -- 次の周期日（この案件の納期目安にもする）。曜日・日付を一度揃えた後は
  -- 単純な+7日／+1ヶ月で曜日・日付がそのまま維持される。
  v_next := case v_sub.cadence when 'weekly' then v_sub.next_due_at + interval '7 days' else v_sub.next_due_at + interval '1 month' end;

  insert into requests (org_id, customer_id, title, note, amount, phase, quoted_at, payment_timing, pay_method, pay_status, paid_at, accepted_at, subscription_id, cadence, due_at)
  values (v_sub.org_id, v_sub.customer_id, v_sub.title, v_sub.note, v_sub.amount, 'preparing', v_now, 'balance', null, 'paid', v_now, v_now, v_sub.id, v_sub.cadence, v_next)
  returning id into v_request_id;

  for v_item in select * from jsonb_array_elements(v_sub.items)
  loop
    insert into request_items (request_id, menu_id, label, price, payout, qty)
    values (v_request_id, null, v_item ->> 'label', (v_item ->> 'price')::integer, coalesce((v_item ->> 'payout')::integer, 0), coalesce((v_item ->> 'qty')::integer, 1));
  end loop;

  update customers set balance = balance - v_sub.amount where id = v_sub.customer_id;
  insert into customer_balance_transactions (customer_id, org_id, amount, kind, request_id)
  values (v_sub.customer_id, v_sub.org_id, -v_sub.amount, 'deduction', v_request_id);

  insert into messages (thread_id, sender_id, sender_role, kind, request_id, payload)
  values (v_sub.customer_thread_id, null, null, 'quote', v_request_id, jsonb_build_object('title', v_sub.title, 'note', v_sub.note));
  update threads set last_msg_at = v_now where id = v_sub.customer_thread_id;

  insert into threads (org_id, kind, request_id, customer_id, last_msg_at)
  values (v_sub.org_id, 'case', v_request_id, v_sub.customer_id, v_now)
  returning id into v_case_thread_id;
  insert into messages (thread_id, sender_id, sender_role, kind, body)
  values (v_case_thread_id, null, null, 'notice', '定期対応の今回分の案件を自動作成し、残高からお支払いを受け取りました（¥' || v_sub.amount || '）');

  update request_subscriptions
  set
    next_due_at = v_next,
    last_insufficient_notice_at = null
  where id = p_subscription_id;

  return v_request_id;
end $$;
grant execute on function charge_subscription_occurrence(uuid) to service_role;
