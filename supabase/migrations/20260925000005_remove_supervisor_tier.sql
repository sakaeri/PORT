-- 「統括担当」は、オーナー／マネージャー／スタッフの3段階ロール設計を
-- 決めた後にこちらで独自に追加してしまった4つ目の階層で、実際には
-- 使わないことになった。enum値自体は削除できない（Postgresの制約。
-- 'reception'/'creator' と同じ扱いで残す）ので、権限チェックから
-- 全て外すだけにする。現時点でsupervisorロールのスタッフはいない。

create or replace function is_office() returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() in ('owner','reception','dept_manager','dept_leader')
$$;

create or replace function my_staff_orgs() returns table(org_id uuid, role app_role, display_name text, is_primary boolean, slug text)
language sql stable security definer set search_path = public as $$
  select p.org_id, p.role, o.display_name, true as is_primary, o.slug
  from profiles p
  join organizations o on o.id = p.org_id
  where p.id = auth.uid() and p.role in ('owner','reception','dept_manager','dept_leader')
  union all
  select l.org_id, l.role, o.display_name, false as is_primary, o.slug
  from staff_org_links l
  join organizations o on o.id = l.org_id
  where l.user_id = auth.uid()
$$;

create or replace function department_visible(dept_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    auth_role() in ('owner','reception')
    or (auth_role() = 'dept_manager' and (
      dept_id is null
      or exists (select 1 from staff_departments sd where sd.profile_id = auth.uid() and sd.department_id = dept_id)
    ))
$$;

create or replace function case_visible(p_customer_id uuid, p_request_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    auth_role() in ('owner','reception')
    or (auth_role() = 'dept_manager' and exists (
      select 1 from staff_departments sd
      where sd.profile_id = auth.uid() and sd.department_id = customer_department_id(p_customer_id)
    ))
    or (auth_role() = 'dept_leader' and exists (
      select 1 from case_staff cs where cs.request_id = p_request_id and cs.profile_id = auth.uid()
    ))
$$;

-- staff_thread_summaries() はまだ実行前かもしれないが、念のためこちらでも
-- 最新の条件に揃えておく（create or replace なので順序に関係なく安全）。
create or replace function staff_thread_summaries(p_org_id uuid)
returns table (
  staff_profile_id uuid,
  thread_id uuid,
  unread boolean,
  last_message_kind message_kind,
  last_message_body text,
  last_message_payload jsonb,
  last_message_deleted_at timestamptz
)
language sql stable as $$
  select
    t.staff_profile_id,
    t.id as thread_id,
    coalesce(m.sender_role <> 'owner'
      and (t.last_read_at is null or t.last_msg_at > t.last_read_at), false) as unread,
    m.kind as last_message_kind,
    m.body as last_message_body,
    m.payload as last_message_payload,
    m.deleted_at as last_message_deleted_at
  from threads t
  left join lateral (
    select kind, body, payload, deleted_at, sender_role
    from messages
    where thread_id = t.id
    order by sent_at desc
    limit 1
  ) m on true
  where t.org_id = p_org_id and t.kind = 'internal' and t.staff_profile_id is not null
$$;
grant execute on function staff_thread_summaries(uuid) to authenticated;

drop policy if exists departments_insert on departments;
create policy departments_insert on departments for insert with check (
  org_id = auth_org() and auth_role() = 'owner'
);
drop policy if exists departments_update on departments;
create policy departments_update on departments for update using (
  org_id = auth_org() and auth_role() = 'owner'
) with check (
  org_id = auth_org() and auth_role() = 'owner'
);

drop policy if exists staff_departments_write on staff_departments;
create policy staff_departments_write on staff_departments for all using (
  auth_role() = 'owner'
  and exists (select 1 from profiles p where p.id = staff_departments.profile_id and p.org_id = auth_org())
);

drop policy if exists staff_invites_manage on staff_invites;
create policy staff_invites_manage on staff_invites for all using (
  org_id = auth_org() and auth_role() = 'owner'
);

drop policy if exists case_staff_write on case_staff;
create policy case_staff_write on case_staff for all using (
  exists (select 1 from requests r where r.id = case_staff.request_id and r.org_id = auth_org() and (
    auth_role() = 'owner'
    or (auth_role() = 'dept_manager' and case_visible(r.customer_id, r.id))
  ))
);

drop policy if exists threads_read on threads;
create policy threads_read on threads for select using (
  (is_staff_of(org_id) and (
    (kind = 'customer' and department_visible(department_id))
    or (kind = 'case' and case_visible(customer_id, request_id))
    or (kind = 'internal' and (staff_profile_id = auth.uid() or auth_role() = 'owner'))
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
    or (kind = 'internal' and is_office() and (staff_profile_id = auth.uid() or auth_role() = 'owner'))
  )
) with check (
  org_id = auth_org() and (
    (kind = 'customer' and is_office())
    or (kind = 'case' and is_office() and case_visible(customer_id, request_id))
    or (kind = 'internal' and is_office() and (staff_profile_id = auth.uid() or auth_role() = 'owner'))
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
          or (t.kind = 'internal' and (t.staff_profile_id = auth.uid() or auth_role() = 'owner'))
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
        or (t.kind = 'internal' and is_office() and (t.staff_profile_id = auth.uid() or auth_role() = 'owner'))
      )
  )
);
