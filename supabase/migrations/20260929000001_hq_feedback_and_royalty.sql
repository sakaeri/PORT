-- ①本部（HQ）直通の「ご意見・ご要望」窓口。担当マネージャーが読む通常の
-- スレッドとは別枠にして、書き込んだ内容が担当マネージャー本人には
-- 見えないようにする（マネージャーへの不満を、本人に見られず出せるように）。
-- 読み出しはHQ側の画面でservice roleを使うため、selectポリシーは付けない
-- （依頼主自身にも「送った内容の一覧」はまだ提供しない。素朴な投書箱の形）。
create table hq_feedback (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index on hq_feedback (org_id, read_at);
alter table hq_feedback enable row level security;

create policy hq_feedback_insert_by_customer on hq_feedback for insert
  with check (org_id = auth_org() and customer_id = my_customer_id());

-- ②ロイヤリティ計算用。FC加盟店（マネージャーの事業者）に対して本部が
-- 取る歩合（%）。nullなら対象外（本部自身の事業者など）。
alter table organizations add column if not exists royalty_pct integer;
