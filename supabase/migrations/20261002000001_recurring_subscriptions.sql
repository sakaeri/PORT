-- 定期対応（毎週・毎月）。受付が見積もり作成時にメニュー項目へ頻度を
-- 付けると、初回は依頼主が「依頼を確定する」を押して確定するが、以降は
-- 依頼主の操作を待たず、周期が来るたびに自動で次の案件を作り、
-- チャージ残高から自動で引き落とす。着手は今まで通り人（担当者）が行う。
-- 引き落とし専用の通知は出さない（見積もりカードと完了報告で把握できる
-- ため）。前回分が未完了でも次の周期分はそのまま作る。

create table request_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id) on delete cascade,
  customer_id        uuid not null references customers(id) on delete cascade,
  customer_thread_id uuid not null references threads(id) on delete cascade,
  title              text not null,
  note               text,
  amount             integer not null,
  items              jsonb not null default '[]'::jsonb, -- [{label, price, payout, qty}]
  cadence            text not null check (cadence in ('weekly', 'monthly')),
  active             boolean not null default false,     -- 初回の支払い確定までは false
  next_due_at        timestamptz,                        -- active になった時点で設定される
  last_insufficient_notice_at date,                       -- 残高不足の通知を1日1回に抑える
  created_by         uuid references profiles(id),
  created_at         timestamptz not null default now(),
  cancelled_at       timestamptz
);
create index on request_subscriptions (org_id, active, next_due_at);

alter table request_subscriptions enable row level security;
create policy request_subscriptions_office on request_subscriptions for all using (
  org_id = auth_org() and is_office()
);

alter table requests add column if not exists subscription_id uuid references request_subscriptions(id) on delete set null;
alter table requests add column if not exists cadence text check (cadence in ('weekly', 'monthly'));

-- 残高からの支払いが確定した時点で、紐づく定期対応があれば有効化し、
-- 次回分の予定日をセットする（初回確定の1回だけ。以降は下の
-- charge_subscription_occurrence が自分で次回日を進める）。
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
    update request_subscriptions
    set active = true, next_due_at = case v_cadence when 'weekly' then v_now + interval '7 days' else v_now + interval '1 month' end
    where id = v_subscription_id and active = false;
  end if;
end $$;
grant execute on function pay_request_from_balance(uuid) to authenticated;

-- 定期対応1件分を作成・課金する。日次バッチ（service role）から呼ぶ想定で、
-- auth.uid() のチェックは行わない。残高が足りない場合は作成せず、
-- その日のうちにまだ知らせていなければ依頼主へ通知だけ送る。
create or replace function charge_subscription_occurrence(p_subscription_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_sub request_subscriptions%rowtype;
  v_balance integer;
  v_now timestamptz := now();
  v_request_id uuid;
  v_case_thread_id uuid;
  v_item jsonb;
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

  insert into requests (org_id, customer_id, title, note, amount, phase, quoted_at, payment_timing, pay_method, pay_status, paid_at, accepted_at, subscription_id, cadence)
  values (v_sub.org_id, v_sub.customer_id, v_sub.title, v_sub.note, v_sub.amount, 'preparing', v_now, 'balance', null, 'paid', v_now, v_now, v_sub.id, v_sub.cadence)
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

  -- 制作者（担当者）とのやり取り・進捗ログ用の案件トークも、通常の見積もり
  -- 作成と同じく毎回作る。
  insert into threads (org_id, kind, request_id, customer_id, last_msg_at)
  values (v_sub.org_id, 'case', v_request_id, v_sub.customer_id, v_now)
  returning id into v_case_thread_id;
  insert into messages (thread_id, sender_id, sender_role, kind, body)
  values (v_case_thread_id, null, null, 'notice', '定期対応の今回分の案件を自動作成し、残高からお支払いを受け取りました（¥' || v_sub.amount || '）');

  update request_subscriptions
  set
    next_due_at = case v_sub.cadence when 'weekly' then v_sub.next_due_at + interval '7 days' else v_sub.next_due_at + interval '1 month' end,
    last_insufficient_notice_at = null
  where id = p_subscription_id;

  return v_request_id;
end $$;
grant execute on function charge_subscription_occurrence(uuid) to service_role;
