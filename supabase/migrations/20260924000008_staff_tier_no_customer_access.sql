-- 「窓口リーダー」を、依頼主とは直接やり取りしない「スタッフ」に位置づけ直す。
-- 表示名（アプリ側）は「スタッフ」に変わるが、DB上の値は互換のため dept_leader
-- のまま。スタッフは案件そのもの（見積り金額・進捗など）や、案件の社内トーク
-- （threads.kind='case'）では引き続き作業できるが、依頼主とのやり取り
-- （customersテーブル・threads.kind='customer'）には一切アクセスできない。
--
-- 案件の社内トークは今まで department に関係なく全スタッフに開放されていたが、
-- 「担当窓口の案件だけ」に絞る（依頼主とのトーク同様、他窓口の案件は見えない）。

-- 依頼主との直接のやり取り（customersテーブル・kind='customer'のトーク）。
-- オーナー・統括担当・reception は無条件。窓口マネージャーは自分の担当窓口
-- のみ。スタッフ（dept_leader）はここには一切含まれない。
create or replace function department_visible(dept_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    auth_role() in ('owner','reception','supervisor')
    or (auth_role() = 'dept_manager' and dept_id is not null and exists (
      select 1 from staff_departments sd where sd.profile_id = auth.uid() and sd.department_id = dept_id
    ))
$$;

-- 案件そのもの（requests/request_items）・案件の社内トーク（kind='case'）への
-- アクセス。department_visible() と違い、スタッフ（dept_leader）も対象に含む
-- （依頼主とは話せないが、案件の作業自体はできるようにするため）。
create or replace function case_visible(p_customer_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    auth_role() in ('owner','reception','supervisor')
    or (auth_role() in ('dept_manager','dept_leader') and exists (
      select 1 from staff_departments sd
      where sd.profile_id = auth.uid() and sd.department_id = customer_department_id(p_customer_id)
    ))
$$;

drop policy if exists requests_read on requests;
create policy requests_read on requests for select using (
  org_id = auth_org() and (
    customer_id = my_customer_id()
    or creator_id = my_creator_id()
    or (is_office() and case_visible(requests.customer_id))
  )
);

drop policy if exists requests_office_write on requests;
create policy requests_office_write on requests for all using (
  org_id = auth_org() and is_office() and case_visible(requests.customer_id)
);

drop policy if exists items_read on request_items;
create policy items_read on request_items for select using (
  exists (select 1 from requests r where r.id = request_id and (
    r.org_id = auth_org() and (
      r.customer_id = my_customer_id()
      or r.creator_id = my_creator_id()
      or (is_office() and case_visible(r.customer_id))
    )
  ))
);

drop policy if exists items_write on request_items;
create policy items_write on request_items for all using (
  exists (select 1 from requests r where r.id = request_id and (
    r.org_id = auth_org() and is_office() and case_visible(r.customer_id)
  ))
);

drop policy if exists threads_read on threads;
create policy threads_read on threads for select using (
  (is_staff_of(org_id) and (
    (kind = 'customer' and department_visible(department_id))
    or (kind = 'case' and case_visible(customer_id))
    or (kind = 'internal' and (staff_profile_id = auth.uid() or auth_role() in ('owner','supervisor')))
  ))
  or (org_id = auth_org() and (
    (kind = 'customer' and customer_id = my_customer_id())
    or (kind = 'case' and (
         creator_id = my_creator_id()
         or exists (select 1 from requests r where r.id = threads.request_id and r.creator_id = my_creator_id())))
  ))
);

drop policy if exists threads_office_write on threads;
create policy threads_office_write on threads for all using (
  org_id = auth_org() and (
    (kind = 'customer' and is_office() and department_visible(department_id))
    or (kind = 'case' and is_office() and case_visible(customer_id))
    or (kind = 'internal' and is_office() and (staff_profile_id = auth.uid() or auth_role() in ('owner','supervisor')))
  )
);

drop policy if exists messages_read on messages;
create policy messages_read on messages for select using (
  exists (
    select 1 from threads t
    where t.id = messages.thread_id
      and (
        (is_staff_of(t.org_id) and (
          (t.kind = 'customer' and department_visible(t.department_id))
          or (t.kind = 'case' and case_visible(t.customer_id))
          or (t.kind = 'internal' and (t.staff_profile_id = auth.uid() or auth_role() in ('owner','supervisor')))
        ))
        or (t.org_id = auth_org() and (
          (t.kind = 'customer' and t.customer_id = my_customer_id())
          or (t.kind = 'case' and (
                t.creator_id = my_creator_id()
                or exists (select 1 from requests r where r.id = t.request_id and r.creator_id = my_creator_id())
          ))
        ))
      )
  )
);

drop policy if exists messages_send on messages;
create policy messages_send on messages for insert with check (
  sender_id = auth.uid()
  and exists (
    select 1 from threads t
    where t.id = messages.thread_id
      and t.org_id = auth_org()
      and (
        (t.kind = 'customer' and (
              (is_office() and department_visible(t.department_id))
              or t.customer_id = my_customer_id()
        ))
        or (t.kind = 'case' and (
              (is_office() and case_visible(t.customer_id))
              or t.creator_id = my_creator_id()
              or exists (select 1 from requests r where r.id = t.request_id and r.creator_id = my_creator_id())
        ))
        or (t.kind = 'internal' and is_office() and (t.staff_profile_id = auth.uid() or auth_role() in ('owner','supervisor')))
      )
  )
);
