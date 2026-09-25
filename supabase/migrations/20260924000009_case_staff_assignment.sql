-- 窓口所属だけで「その窓口の案件が全部見える」状態になっていたスタッフ
-- （dept_leader）の案件アクセスを、案件ごとの個別割り当てに変更する。
-- マネージャー（dept_manager）の窓口ベースのアクセスはそのまま
-- （マネージャーがどの窓口を担当するか、という意味は変わらない）。

create table if not exists case_staff (
  request_id uuid not null references requests(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (request_id, profile_id)
);
alter table case_staff enable row level security;

create policy case_staff_read on case_staff for select using (
  exists (select 1 from requests r where r.id = case_staff.request_id and r.org_id = auth_org() and is_office())
);
-- 割り当て・解除ができるのはオーナー・統括担当・マネージャー（自分の
-- 担当窓口の案件のみ）。スタッフ自身は割り当てを変更できない。
create policy case_staff_write on case_staff for all using (
  exists (select 1 from requests r where r.id = case_staff.request_id and r.org_id = auth_org() and (
    auth_role() in ('owner','supervisor')
    or (auth_role() = 'dept_manager' and case_visible(r.customer_id, r.id))
  ))
);

-- case_visible() に request_id を追加。マネージャーは今まで通り窓口
-- ベース、スタッフ（dept_leader）はcase_staffに個別に割り当てられた
-- 案件だけが対象になる。古い1引数版は、それを使っているポリシーを
-- 全部差し替えたあと、ファイルの最後で明示的に削除する（create or
-- replaceは引数が違うと別関数として残ってしまう上、まだ使われている
-- 関数は依存エラーで削除できないため）。
create or replace function case_visible(p_customer_id uuid, p_request_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    auth_role() in ('owner','reception','supervisor')
    or (auth_role() = 'dept_manager' and exists (
      select 1 from staff_departments sd
      where sd.profile_id = auth.uid() and sd.department_id = customer_department_id(p_customer_id)
    ))
    or (auth_role() = 'dept_leader' and exists (
      select 1 from case_staff cs where cs.request_id = p_request_id and cs.profile_id = auth.uid()
    ))
$$;

drop policy if exists requests_read on requests;
create policy requests_read on requests for select using (
  org_id = auth_org() and (
    customer_id = my_customer_id()
    or creator_id = my_creator_id()
    or (is_office() and case_visible(requests.customer_id, requests.id))
  )
);

drop policy if exists requests_office_write on requests;
create policy requests_office_write on requests for all using (
  org_id = auth_org() and is_office() and case_visible(requests.customer_id, requests.id)
);

drop policy if exists items_read on request_items;
create policy items_read on request_items for select using (
  exists (select 1 from requests r where r.id = request_id and (
    r.org_id = auth_org() and (
      r.customer_id = my_customer_id()
      or r.creator_id = my_creator_id()
      or (is_office() and case_visible(r.customer_id, r.id))
    )
  ))
);

drop policy if exists items_write on request_items;
create policy items_write on request_items for all using (
  exists (select 1 from requests r where r.id = request_id and (
    r.org_id = auth_org() and is_office() and case_visible(r.customer_id, r.id)
  ))
);

drop policy if exists threads_read on threads;
create policy threads_read on threads for select using (
  (is_staff_of(org_id) and (
    (kind = 'customer' and department_visible(department_id))
    or (kind = 'case' and case_visible(customer_id, request_id))
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
    or (kind = 'case' and is_office() and case_visible(customer_id, request_id))
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
          or (t.kind = 'case' and case_visible(t.customer_id, t.request_id))
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
              (is_office() and case_visible(t.customer_id, t.request_id))
              or t.creator_id = my_creator_id()
              or exists (select 1 from requests r where r.id = t.request_id and r.creator_id = my_creator_id())
        ))
        or (t.kind = 'internal' and is_office() and (t.staff_profile_id = auth.uid() or auth_role() in ('owner','supervisor')))
      )
  )
);

-- ここまでで古い1引数版 case_visible(uuid) を使うポリシーは全部
-- 差し替え終えたので、名残の関数を削除する。
drop function if exists case_visible(uuid);
