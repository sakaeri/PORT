-- RLS ポリシー
-- 前提: すべてのテーブルは organizations 配下。ロールは profiles.role。
-- 権限の要点（仕様上ゆずれない3点）
--   1. work_memos は 依頼主に見せない（担当制作者・受付・後任のみ）
--   2. ratings.stars は 制作者に一切見せない。コメントは受付が共有したものだけ creator_voices 経由で届く
--   3. 制作者は自分に割り当てられた案件のトークしか読めない

-- ---------- ヘルパ ----------
-- security definer + search_path 固定: これらは profiles/creators/customers という
-- RLS 対象テーブル自身を読むため、素の SQL 関数のままだと「行のRLS判定 → is_office() 等の
-- 呼び出し → 対象テーブルへの再クエリ → 再度RLS判定 → …」で無限再帰し得る
-- （小さいテーブルで seq scan になったときに実際に stack depth limit exceeded で再現した）。
-- security definer にして関数所有者（テーブル所有者）権限で読ませ、内部クエリを RLS の外に
-- 出すことで再帰を断つ。関数の中身は auth.uid() 本人の1行しか返さないので権限昇格にはならない。
create or replace function auth_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid()
$$;

create or replace function auth_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function is_office() returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() in ('owner','reception')
$$;

create or replace function my_creator_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from creators where profile_id = auth.uid()
$$;

create or replace function my_customer_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from customers where profile_id = auth.uid()
$$;

-- ---------- 有効化 ----------
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop execute format('alter table %I enable row level security', t); end loop;
end $$;

-- ---------- 組織・プロフィール ----------
create policy org_read on organizations for select
  using (id = auth_org());
create policy org_write on organizations for update
  using (id = auth_org() and auth_role() = 'owner');

-- 紹介チケットは「自分が紹介した分」だけ。紹介先の事業所名・課金状況は見えない。
create policy referral_own on referral_credits for select
  using (referrer_user_id = auth.uid());
-- 発行・確定・消費はサーバ側（service_role）だけが行う。ユーザーの書き込みポリシーは置かない。

create policy profiles_self on profiles for select
  using (id = auth.uid() or (org_id = auth_org() and is_office()));
create policy profiles_self_update on profiles for update
  using (id = auth.uid());

-- ---------- 依頼主 ----------
create policy customers_read on customers for select using (
  org_id = auth_org() and (
    is_office()
    or profile_id = auth.uid()
    or creator_id = my_creator_id()      -- 担当している制作者だけ
  )
);
create policy customers_office_write on customers for all
  using (org_id = auth_org() and is_office());

create policy vault_owner on customer_vault_items for all using (
  customer_id = my_customer_id()
);
create policy vault_office on customer_vault_items for select using (
  exists (select 1 from customers c where c.id = customer_id and c.org_id = auth_org() and is_office())
);

-- ---------- メニュー・設定（読みは全員、書きは受付）----------
create policy menus_read on menus for select using (org_id = auth_org());
create policy menus_write on menus for all using (org_id = auth_org() and is_office());

create policy menu_q_read on menu_questions for select using (
  exists (select 1 from menus m where m.id = menu_id and m.org_id = auth_org())
);
create policy menu_q_write on menu_questions for all using (
  exists (select 1 from menus m where m.id = menu_id and m.org_id = auth_org()) and is_office()
);

create policy intake_read on intake_forms for select using (org_id = auth_org());
create policy intake_write on intake_forms for all using (org_id = auth_org() and is_office());
create policy intake_f_read on intake_fields for select using (
  exists (select 1 from intake_forms f where f.id = form_id and f.org_id = auth_org())
);
create policy intake_f_write on intake_fields for all using (
  exists (select 1 from intake_forms f where f.id = form_id and f.org_id = auth_org()) and is_office()
);

create policy answers_owner on customer_answers for all using (customer_id = my_customer_id());
create policy answers_office on customer_answers for all using (
  exists (select 1 from customers c where c.id = customer_id and c.org_id = auth_org() and is_office())
);

create policy policy_read on refund_policies for select using (org_id = auth_org());
create policy policy_write on refund_policies for all using (org_id = auth_org() and is_office());

-- ---------- 契約書（当事者と受付のみ）----------
create policy agreements_office on agreements for all using (org_id = auth_org() and is_office());
create policy agreements_party on agreements for select using (
  exists (select 1 from creator_agreements ca
          where ca.agreement_id = agreements.id and ca.creator_id = my_creator_id())
);
create policy ag_extras_read on agreement_extras for select using (
  exists (select 1 from agreements a where a.id = agreement_id and (
    (a.org_id = auth_org() and is_office())
    or exists (select 1 from creator_agreements ca where ca.agreement_id = a.id and ca.creator_id = my_creator_id())))
);
create policy creator_ag_read on creator_agreements for select using (
  creator_id = my_creator_id() or is_office()
);

-- ---------- 制作者の設定・稼働・書類・報酬（本人＋受付）----------
create policy creators_read on creators for select using (
  org_id = auth_org() and (is_office() or profile_id = auth.uid())
);
create policy creators_self on creators for update using (profile_id = auth.uid());
create policy creators_office on creators for all using (org_id = auth_org() and is_office());

create policy skills_rw on creator_skills for all using (creator_id = my_creator_id() or is_office());
create policy tags_rw   on creator_tags   for all using (creator_id = my_creator_id() or is_office());
create policy rates_read on creator_rates for select using (creator_id = my_creator_id() or is_office());
create policy rates_write on creator_rates for all using (is_office());
create policy avail_rw  on creator_availability for all using (creator_id = my_creator_id() or is_office());
create policy docs_read on creator_documents for select using (creator_id = my_creator_id() or is_office());
create policy docs_upload on creator_documents for insert with check (creator_id = my_creator_id() or is_office());
create policy docs_office on creator_documents for update using (is_office());

create policy stmt_read on payout_statements for select using (creator_id = my_creator_id() or is_office());
create policy stmt_confirm on payout_statements for update using (creator_id = my_creator_id() or is_office());
create policy lines_read on payout_lines for select using (
  exists (select 1 from payout_statements s where s.id = statement_id
          and (s.creator_id = my_creator_id() or is_office()))
);

-- ---------- 案件 ----------
create policy requests_read on requests for select using (
  org_id = auth_org() and (
    is_office()
    or customer_id = my_customer_id()
    or creator_id = my_creator_id()
  )
);
create policy requests_office_write on requests for all using (org_id = auth_org() and is_office());
create policy requests_creator_progress on requests for update using (creator_id = my_creator_id());

create policy items_read on request_items for select using (
  exists (select 1 from requests r where r.id = request_id and (
    r.org_id = auth_org() and (is_office() or r.customer_id = my_customer_id() or r.creator_id = my_creator_id())))
);
create policy items_write on request_items for all using (is_office());

-- ---------- トーク ----------
create policy threads_read on threads for select using (
  org_id = auth_org() and (
    is_office()
    or (kind = 'customer' and customer_id = my_customer_id())
    or (kind in ('case','internal') and (
         creator_id = my_creator_id()
         or exists (select 1 from requests r where r.id = threads.request_id and r.creator_id = my_creator_id())))
  )
);
create policy threads_office_write on threads for all using (org_id = auth_org() and is_office());

create policy messages_read on messages for select using (
  exists (select 1 from threads t where t.id = thread_id)   -- threads の RLS が実質のゲート
);
create policy messages_send on messages for insert with check (
  sender_id = auth.uid() and exists (select 1 from threads t where t.id = thread_id)
);

create policy reads_self on message_reads for all using (profile_id = auth.uid());
create policy attach_read on message_attachments for select using (
  exists (select 1 from messages m where m.id = message_id)
);
create policy attach_add on message_attachments for insert with check (
  exists (select 1 from messages m where m.id = message_id and m.sender_id = auth.uid())
);

-- ---------- 完了報告 ----------
create policy reports_read on completion_reports for select using (
  exists (select 1 from requests r where r.id = request_id and (
    is_office()
    or r.creator_id = my_creator_id()
    or (r.customer_id = my_customer_id() and completion_reports.sent_at is not null)))  -- 送信後だけ依頼主に見える
);
create policy reports_submit on completion_reports for insert with check (
  creator_id = my_creator_id() or is_office()
);
create policy reports_office_update on completion_reports for update using (is_office());

-- ---------- 評価（★は制作者に見せない）----------
create policy ratings_insert on ratings for insert with check (customer_id = my_customer_id());
create policy ratings_read on ratings for select using (
  customer_id = my_customer_id()
  or exists (select 1 from customers c where c.id = customer_id and c.org_id = auth_org() and is_office())
);
-- 制作者向けのポリシーは意図的に無し。制作者は creator_voices 経由でのみ受け取る。
-- 集計を出す場合も security definer の関数を「受付ロール限定」で用意し、制作者からは呼べないようにする。

create policy voices_read on creator_voices for select using (
  creator_id = my_creator_id() or is_office()
);
create policy voices_share on creator_voices for insert with check (is_office());

-- ---------- 作業メモ（依頼主に見せない・追記のみ）----------
create policy memos_read on work_memos for select using (
  exists (select 1 from customers c where c.id = customer_id and c.org_id = auth_org() and (
    is_office() or c.creator_id = my_creator_id()))
);
create policy memos_insert on work_memos for insert with check (
  author_id = auth.uid() and (is_office() or exists (
    select 1 from customers c where c.id = customer_id and c.creator_id = my_creator_id()))
);
create policy memos_delete_own on work_memos for delete using (author_id = auth.uid());

-- ---------- SLA・報告 ----------
create policy sla_office on sla_events for all using (org_id = auth_org() and is_office());
create policy payacct_read on payment_accounts for select using (org_id = auth_org());
create policy payacct_office on payment_accounts for all using (org_id = auth_org() and is_office());

create policy oreports_own on office_reports for select using (
  creator_id = my_creator_id() or (org_id = auth_org() and is_office())
);
create policy oreports_create on office_reports for insert with check (creator_id = my_creator_id());
create policy oreports_office on office_reports for update using (org_id = auth_org() and is_office());
