-- ①メニュー編集画面にあった「担当窓口」の選択は、スタッフ画面の窓口カード側
-- （窓口ごとに対応メニューを選ぶ）に引っ越す。スキーマ・RLSの変更は不要
-- （menus.department_id はそのまま。設定する画面が変わるだけ）。
--
-- ②窓口未設定（department_idがnull）のトークが、窓口マネージャー・
-- 窓口リーダーにも見えてしまっていたのを直す。「本部（オーナー・統括担当）が
-- 手動で窓口を割り振るまで待つ」という意図に合わせ、未割り振りはオーナー・
-- 統括担当・reception にだけ見せる。
create or replace function department_visible(dept_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    auth_role() in ('owner','reception','supervisor')
    or (dept_id is not null and dept_id = (select p.department_id from profiles p where p.id = auth.uid() and p.org_id = auth_org()))
$$;

-- ③スタッフ⇄本部（オーナー・統括担当）の1対1連絡チャット。thread_kind='internal'
-- は元々「受付↔制作者」用に用意されていたが、制作者機能ごと削除済みで
-- 一件も使われていない。ここでスタッフ連絡用に転用する。
alter table threads add column if not exists staff_profile_id uuid references profiles(id) on delete cascade;

-- スタッフ1人につき本部との連絡スレッドは1本だけ。
create unique index if not exists threads_staff_internal_unique
  on threads (org_id, staff_profile_id)
  where kind = 'internal';

-- 案件トーク（kind='case'）は今まで通り全スタッフに開放したまま、
-- internal だけ「本人 or オーナー・統括担当」に絞る。
drop policy if exists threads_read on threads;
create policy threads_read on threads for select using (
  (is_staff_of(org_id) and (
    (kind = 'customer' and department_visible(department_id))
    or kind = 'case'
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
    or (kind = 'case' and is_office())
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
          or t.kind = 'case'
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
              is_office()
              or t.creator_id = my_creator_id()
              or exists (select 1 from requests r where r.id = t.request_id and r.creator_id = my_creator_id())
        ))
        or (t.kind = 'internal' and is_office() and (t.staff_profile_id = auth.uid() or auth_role() in ('owner','supervisor')))
      )
  )
);
