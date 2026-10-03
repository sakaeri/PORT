-- kind='hq' のスレッドは、依頼主本人と本部（owner）だけが読み書きできる
-- （担当マネージャー・スタッフには見えない、人間秘書サービスの「本部直通」
-- の建付け）。既存の threads/messages の仕組みをそのまま使い、
-- customer_id だけで紐付ける（窓口の概念は関係ない）。

drop policy if exists threads_read on threads;
create policy threads_read on threads for select using (
  (is_staff_of(org_id) and (
    (kind = 'customer' and department_visible(department_id))
    or (kind = 'case' and case_visible(customer_id, request_id))
    or (kind = 'internal' and staff_internal_visible(staff_profile_id))
    or (kind = 'hq' and auth_role() = 'owner')
  ))
  or (org_id = auth_org() and (
    (kind = 'customer' and customer_id = my_customer_id())
    or (kind = 'case' and (
         creator_id = my_creator_id()
         or exists (select 1 from requests r where r.id = threads.request_id and r.creator_id = my_creator_id())))
    or (kind = 'hq' and customer_id = my_customer_id())
  ))
);

drop policy if exists threads_office_write on threads;
create policy threads_office_write on threads for all using (
  org_id = auth_org() and (
    (kind = 'customer' and is_office() and department_visible(department_id))
    or (kind = 'case' and is_office() and case_visible(customer_id, request_id))
    or (kind = 'internal' and is_office() and staff_internal_visible(staff_profile_id))
    or (kind = 'hq' and is_office() and auth_role() = 'owner')
  )
) with check (
  org_id = auth_org() and (
    (kind = 'customer' and is_office())
    or (kind = 'case' and is_office() and case_visible(customer_id, request_id))
    or (kind = 'internal' and is_office() and staff_internal_visible(staff_profile_id))
    or (kind = 'hq' and is_office() and auth_role() = 'owner')
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
          or (t.kind = 'internal' and staff_internal_visible(t.staff_profile_id))
          or (t.kind = 'hq' and auth_role() = 'owner')
        ))
        or (t.org_id = auth_org() and (
          (t.kind = 'customer' and t.customer_id = my_customer_id())
          or (t.kind = 'case' and (
                t.creator_id = my_creator_id()
                or exists (select 1 from requests r where r.id = t.request_id and r.creator_id = my_creator_id())
          ))
          or (t.kind = 'hq' and t.customer_id = my_customer_id())
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
        or (t.kind = 'internal' and is_office() and staff_internal_visible(t.staff_profile_id))
        or (t.kind = 'hq' and (
              t.customer_id = my_customer_id()
              or (is_office() and auth_role() = 'owner')
        ))
      )
  )
);

-- 本部側（owner）がご意見・ご要望の一覧を見るための、依頼主ごとの
-- 最終メッセージ・未読フラグ。customer_thread_summaries() と同じ考え方。
create or replace function hq_thread_summaries(p_org_id uuid)
returns table (
  customer_id uuid,
  thread_id uuid,
  unread boolean,
  last_message_kind message_kind,
  last_message_body text,
  last_message_payload jsonb,
  last_message_deleted_at timestamptz,
  last_message_sender_role app_role
)
language sql stable as $$
  select
    t.customer_id,
    t.id as thread_id,
    coalesce(m.sender_role = 'client' and (t.last_read_at is null or t.last_msg_at > t.last_read_at), false) as unread,
    m.kind as last_message_kind,
    m.body as last_message_body,
    m.payload as last_message_payload,
    m.deleted_at as last_message_deleted_at,
    m.sender_role as last_message_sender_role
  from threads t
  left join lateral (
    select kind, body, payload, deleted_at, sender_role
    from messages
    where thread_id = t.id
    order by sent_at desc
    limit 1
  ) m on true
  where t.org_id = p_org_id and t.kind = 'hq' and t.customer_id is not null
$$;
grant execute on function hq_thread_summaries(uuid) to authenticated;
