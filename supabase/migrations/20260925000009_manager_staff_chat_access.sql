-- マネージャーもスタッフ一覧を見て、スタッフとチャットできるようにする
-- （招待・役職変更・削除などの管理操作は引き続きオーナーのみ）。
-- スタッフ⇄本部の内部スレッド（kind='internal'）の「本部側」判定を
-- オーナーだけからオーナー・マネージャーに広げる。

drop policy if exists threads_read on threads;
create policy threads_read on threads for select using (
  (is_staff_of(org_id) and (
    (kind = 'customer' and department_visible(department_id))
    or (kind = 'case' and case_visible(customer_id, request_id))
    or (kind = 'internal' and (staff_profile_id = auth.uid() or auth_role() in ('owner','dept_manager')))
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
    or (kind = 'case' and is_office() and case_visible(customer_id, request_id))
    or (kind = 'internal' and is_office() and (staff_profile_id = auth.uid() or auth_role() in ('owner','dept_manager')))
  )
) with check (
  org_id = auth_org() and (
    (kind = 'customer' and is_office())
    or (kind = 'case' and is_office() and case_visible(customer_id, request_id))
    or (kind = 'internal' and is_office() and (staff_profile_id = auth.uid() or auth_role() in ('owner','dept_manager')))
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
          or (t.kind = 'case' and case_visible(t.customer_id, t.request_id))
          or (t.kind = 'internal' and (t.staff_profile_id = auth.uid() or auth_role() in ('owner','dept_manager')))
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
              (is_office() and case_visible(t.customer_id, t.request_id))
              or t.creator_id = my_creator_id()
              or exists (select 1 from requests r where r.id = t.request_id and r.creator_id = my_creator_id())
        ))
        or (t.kind = 'internal' and is_office() and (t.staff_profile_id = auth.uid() or auth_role() in ('owner','dept_manager')))
      )
  )
);
