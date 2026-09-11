-- PORT本部(organizations.is_hq = true)のスタッフだけ、他の全事業所の
-- 基本的な契約情報（名前・プラン状況・基本料・席数）を横断して見られるようにする。
-- 依頼主データ・トーク・案件などは一切含まない（organizations 自体の行のみ）。
-- 「アプリの登録事業者数とそれに応じた売上」を出すための、PORT運営専用の閲覧権限。
--
-- security definer が必須: このポリシー自体が organizations を読むポリシーの
-- 中から organizations を再度参照すると無限再帰になる（実際にローカルテストで
-- 再現した）。既存の auth_org()/is_office() と同じ理由・同じ直し方。
create or replace function is_hq_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    join organizations hq on hq.id = p.org_id
    where p.id = auth.uid() and hq.is_hq = true and p.role in ('owner', 'reception')
  )
$$;

create policy org_read_by_hq_staff on organizations for select using (is_hq_staff());
