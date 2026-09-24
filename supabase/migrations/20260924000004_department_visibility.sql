-- 窓口（部署）ごとの実際の閲覧制限。オーナー・統括担当（・過去互換の
-- reception）は全窓口を見渡せる。窓口マネージャー・窓口リーダーは自分の
-- 担当窓口のトーク・依頼主・案件だけが見える（他窓口は物理的に見えない
-- ＝盗み見できない）。まだどの窓口にも紐付いていないトーク（依頼主が
-- まだメニューを選んでいない最初期の状態）は、誰も取りこぼさないよう
-- 全員に見せる。
--
-- 依頼主1人＝1本のトークという構造上、「どの窓口の話か」はトーク単位で
-- 決める（threads.department_id）。依頼主が最初にメニューを選んだ時に
-- 自動で設定し、話の内容が変わったら受付側が手動で窓口を切り替えられる
-- （担当スタッフを交代させるのと同じ操作）。
--
-- 重要：threads_read/messages_read は 20260914000011_realtime_org_visibility.sql
-- で is_staff_of() ベースに切り替わっている（postgres_changesのWebSocket購読が
-- x-vid-orgヘッダーを送れないための対応）。ここではその仕組みを維持したまま
-- 窓口の絞り込みを重ねる。is_staff_of() は新しい3ロールを含んでいなかった
-- ため、そのままだと統括担当・窓口マネージャー・窓口リーダーが受付画面で
-- 何も見えなくなってしまう不具合があった。ここで合わせて直す。

alter table threads add column if not exists department_id uuid references departments(id) on delete set null;

create or replace function department_visible(dept_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    auth_role() in ('owner','reception','supervisor')
    or dept_id is null
    or dept_id = (select p.department_id from profiles p where p.id = auth.uid() and p.org_id = auth_org())
$$;

-- is_staff_of() に新しい3ロールを追加。
create or replace function is_staff_of(target_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and org_id = target_org and role in ('owner','reception','supervisor','dept_manager','dept_leader')
  ) or exists (
    select 1 from staff_org_links where user_id = auth.uid() and org_id = target_org and role in ('owner','reception')
  )
$$;

-- ---------- トーク ----------
drop policy if exists threads_read on threads;
create policy threads_read on threads for select using (
  (is_staff_of(org_id) and (kind <> 'customer' or department_visible(department_id)))
  or (org_id = auth_org() and (
    (kind = 'customer' and customer_id = my_customer_id())
    or (kind in ('case','internal') and (
         creator_id = my_creator_id()
         or exists (select 1 from requests r where r.id = threads.request_id and r.creator_id = my_creator_id())))
  ))
);

drop policy if exists threads_office_write on threads;
create policy threads_office_write on threads for all using (
  org_id = auth_org() and (
    (kind = 'customer' and is_office() and department_visible(department_id))
    or (kind in ('case','internal') and is_office())
  )
);

-- ---------- メッセージ ----------
drop policy if exists messages_read on messages;
create policy messages_read on messages for select using (
  exists (
    select 1 from threads t
    where t.id = messages.thread_id
      and (
        (is_staff_of(t.org_id) and (t.kind <> 'customer' or department_visible(t.department_id)))
        or (t.org_id = auth_org() and (
          (t.kind = 'customer' and t.customer_id = my_customer_id())
          or (t.kind in ('case','internal') and (
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
        (is_office() and department_visible(t.department_id))
        or (t.kind = 'customer' and t.customer_id = my_customer_id())
        or (t.kind in ('case','internal') and (
              t.creator_id = my_creator_id()
              or exists (select 1 from requests r where r.id = t.request_id and r.creator_id = my_creator_id())
        ))
      )
  )
);

-- ---------- 依頼主 ----------
drop policy if exists customers_read on customers;
create policy customers_read on customers for select using (
  org_id = auth_org() and (
    profile_id = auth.uid()
    or creator_id = my_creator_id()
    or (is_office() and department_visible((
      select t.department_id from threads t where t.customer_id = customers.id and t.kind = 'customer' limit 1
    )))
  )
);

drop policy if exists customers_office_write on customers;
create policy customers_office_write on customers for all using (
  org_id = auth_org() and is_office() and department_visible((
    select t.department_id from threads t where t.customer_id = customers.id and t.kind = 'customer' limit 1
  ))
);

-- ---------- 案件 ----------
drop policy if exists requests_read on requests;
create policy requests_read on requests for select using (
  org_id = auth_org() and (
    customer_id = my_customer_id()
    or creator_id = my_creator_id()
    or (is_office() and department_visible((
      select t.department_id from threads t where t.customer_id = requests.customer_id and t.kind = 'customer' limit 1
    )))
  )
);

drop policy if exists requests_office_write on requests;
create policy requests_office_write on requests for all using (
  org_id = auth_org() and is_office() and department_visible((
    select t.department_id from threads t where t.customer_id = requests.customer_id and t.kind = 'customer' limit 1
  ))
);
-- requests_creator_progress（制作者本人の進捗更新）は変更なし。

-- request_items は requests のRLSに素通しせず、is_office() を直接
-- 埋め込んだ独自条件になっていたため、ここも同様に窓口の絞り込みを追加する。
drop policy if exists items_read on request_items;
create policy items_read on request_items for select using (
  exists (select 1 from requests r where r.id = request_id and (
    r.org_id = auth_org() and (
      r.customer_id = my_customer_id()
      or r.creator_id = my_creator_id()
      or (is_office() and department_visible((
        select t.department_id from threads t where t.customer_id = r.customer_id and t.kind = 'customer' limit 1
      )))
    )
  ))
);

drop policy if exists items_write on request_items;
create policy items_write on request_items for all using (
  exists (select 1 from requests r where r.id = request_id and (
    r.org_id = auth_org() and is_office() and department_visible((
      select t.department_id from threads t where t.customer_id = r.customer_id and t.kind = 'customer' limit 1
    ))
  ))
);
