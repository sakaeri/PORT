-- 紹介元（士業の先生など）と紹介特典。
--
-- 紹介カードを受け取った社長がトークで「〇〇先生の紹介です」と伝えたら、
-- スタッフが依頼主の画面で紹介元を選ぶ。選ぶと 5,000円分がチャージ残高に入る
-- （普通の残高として使える・有効期限なし・1人1回だけ）。紹介元へのお礼（紹介料）は無し。

create table if not exists referral_sources (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  active     boolean not null default true,
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists referral_sources_org_idx on referral_sources (org_id, sort);
alter table referral_sources enable row level security;

drop policy if exists referral_sources_read on referral_sources;
create policy referral_sources_read on referral_sources for select using (
  org_id = auth_org() and is_office()
);
-- 登録・名前の変更・非表示は本部だけ。
drop policy if exists referral_sources_write on referral_sources;
create policy referral_sources_write on referral_sources for all using (
  org_id = auth_org() and auth_role() in ('owner', 'reception')
) with check (
  org_id = auth_org() and auth_role() in ('owner', 'reception')
);

alter table customers add column if not exists referral_source_id uuid references referral_sources(id);
alter table customers add column if not exists referral_granted_at timestamptz;

-- 残高の入出金の種類に「紹介特典」を足す（取り消しは同じ種類の負の行）。
alter table customer_balance_transactions drop constraint if exists customer_balance_transactions_kind_check;
alter table customer_balance_transactions add constraint customer_balance_transactions_kind_check
  check (kind in ('charge', 'deduction', 'refund_credit', 'referral_credit'));

-- 紹介特典を付ける。本部か、その依頼主を担当できる秘書（マネージャー）だけ。
-- 問い合わせ窓口のトーク（残高が無い）には付けない。二重には付かない。
create or replace function grant_referral_credit(p_customer_id uuid, p_source_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  c customers%rowtype;
  v_amount constant integer := 5000;
begin
  if auth_role() not in ('owner', 'reception', 'dept_manager') then
    raise exception '紹介特典を付ける権限がありません';
  end if;

  select * into c from customers where id = p_customer_id for update;
  if not found or c.org_id <> auth_org() or not department_visible(customer_department_id(c.id)) then
    raise exception '依頼主が見つかりません';
  end if;
  if c.desk_id is not null then
    raise exception '問い合わせ窓口のトークには紹介特典を付けられません';
  end if;
  if c.referral_granted_at is not null then
    raise exception 'この依頼主にはすでに紹介特典を付けています';
  end if;
  if not exists (select 1 from referral_sources where id = p_source_id and org_id = c.org_id and active) then
    raise exception '紹介元を選び直してください';
  end if;

  update customers
  set balance = balance + v_amount, referral_source_id = p_source_id, referral_granted_at = now()
  where id = c.id;
  insert into customer_balance_transactions (customer_id, org_id, amount, kind)
  values (c.id, c.org_id, v_amount, 'referral_credit');

  return c.balance + v_amount;
end $$;
grant execute on function grant_referral_credit(uuid, uuid) to authenticated;

-- 間違えて付けたときの取り消し（本部だけ）。もう使われた分は戻せないので、
-- 残っている残高から最大 5,000円だけ引く。
create or replace function revoke_referral_credit(p_customer_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  c customers%rowtype;
  v_back integer;
begin
  if auth_role() not in ('owner', 'reception') then
    raise exception '取り消しは本部だけができます';
  end if;

  select * into c from customers where id = p_customer_id for update;
  if not found or c.org_id <> auth_org() then
    raise exception '依頼主が見つかりません';
  end if;
  if c.referral_granted_at is null then
    raise exception '紹介特典は付いていません';
  end if;

  v_back := least(5000, greatest(c.balance, 0));
  update customers
  set balance = balance - v_back, referral_source_id = null, referral_granted_at = null
  where id = c.id;
  if v_back > 0 then
    insert into customer_balance_transactions (customer_id, org_id, amount, kind)
    values (c.id, c.org_id, -v_back, 'referral_credit');
  end if;

  return c.balance - v_back;
end $$;
grant execute on function revoke_referral_credit(uuid) to authenticated;

notify pgrst, 'reload schema';
