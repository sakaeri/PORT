-- 前のマイグレーション(20260924000004)で発生した無限再帰の修正。
--
-- customers_read/customers_office_write/requests_read/requests_office_write/
-- items_read/items_write の中で「この依頼主の窓口はどこか」を調べるために
-- threads テーブルへ直接サブクエリを書いていたが、そのサブクエリ自体が
-- threads のRLS（threads_read）を発動させてしまう。threads_read は
-- kind='case'/'internal' のとき requests テーブルを再度参照するため、
-- requests → threads → requests → ... という循環が起きて
-- 「infinite recursion detected in policy for relation "threads"」になっていた。
--
-- 対策は他の auth_role()/is_office()/my_customer_id() などと同じで、
-- security definer 関数の中で threads を引くことで、そのルックアップだけ
-- RLSをバイパスさせる（関数の外側のポリシー評価には影響しない）。

create or replace function customer_department_id(p_customer_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select t.department_id from threads t where t.customer_id = p_customer_id and t.kind = 'customer' limit 1
$$;

-- ---------- 依頼主 ----------
drop policy if exists customers_read on customers;
create policy customers_read on customers for select using (
  org_id = auth_org() and (
    profile_id = auth.uid()
    or creator_id = my_creator_id()
    or (is_office() and department_visible(customer_department_id(customers.id)))
  )
);

drop policy if exists customers_office_write on customers;
create policy customers_office_write on customers for all using (
  org_id = auth_org() and is_office() and department_visible(customer_department_id(customers.id))
);

-- ---------- 案件 ----------
drop policy if exists requests_read on requests;
create policy requests_read on requests for select using (
  org_id = auth_org() and (
    customer_id = my_customer_id()
    or creator_id = my_creator_id()
    or (is_office() and department_visible(customer_department_id(requests.customer_id)))
  )
);

drop policy if exists requests_office_write on requests;
create policy requests_office_write on requests for all using (
  org_id = auth_org() and is_office() and department_visible(customer_department_id(requests.customer_id))
);

drop policy if exists items_read on request_items;
create policy items_read on request_items for select using (
  exists (select 1 from requests r where r.id = request_id and (
    r.org_id = auth_org() and (
      r.customer_id = my_customer_id()
      or r.creator_id = my_creator_id()
      or (is_office() and department_visible(customer_department_id(r.customer_id)))
    )
  ))
);

drop policy if exists items_write on request_items;
create policy items_write on request_items for all using (
  exists (select 1 from requests r where r.id = request_id and (
    r.org_id = auth_org() and is_office() and department_visible(customer_department_id(r.customer_id))
  ))
);
