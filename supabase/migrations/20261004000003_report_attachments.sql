-- 完了報告に画像・PDFを添付できるようにする。チャットの添付
-- （message_attachments・'attachments'バケット）と同じ考え方。
-- completion_reports の行は「この内容で完了報告する」を押した時に
-- 初めて作られるため、それより前（フォームを開いている間）にアップロード
-- できるよう、report_id ではなく requests.id を単位にする
-- （案件に対する完了報告は実質1回なので、request_id で十分に一意）。
create table completion_report_attachments (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references requests(id) on delete cascade,
  file_path   text not null,
  file_name   text not null,
  mime        text,
  bytes       integer,
  created_at  timestamptz not null default now()
);
create index on completion_report_attachments (request_id);

alter table completion_report_attachments enable row level security;

-- 読み：事業者のスタッフはいつでも。依頼主は、送信済みの完了報告がある
-- 案件の分だけ読める。
create policy completion_report_attachments_read on completion_report_attachments for select using (
  exists (
    select 1 from requests r
    where r.id = completion_report_attachments.request_id
      and r.org_id = auth_org()
      and (
        is_office()
        or (r.customer_id = my_customer_id() and exists (
          select 1 from completion_reports cr where cr.request_id = r.id and cr.sent_at is not null
        ))
      )
  )
);

-- 書き：事業者のスタッフのみ（依頼主はアップロードしない）。
create policy completion_report_attachments_write on completion_report_attachments for all using (
  exists (
    select 1 from requests r
    where r.id = completion_report_attachments.request_id and r.org_id = auth_org() and is_office()
  )
);

-- ストレージ側。パスの先頭フォルダは "report-<request_id>"。
drop policy if exists report_attachments_read on storage.objects;
create policy report_attachments_read on storage.objects for select using (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] like 'report-%'
  and exists (
    select 1 from requests r
    where ('report-' || r.id::text) = (storage.foldername(name))[1]
      and r.org_id = auth_org()
      and (
        is_office()
        or (r.customer_id = my_customer_id() and exists (
          select 1 from completion_reports cr where cr.request_id = r.id and cr.sent_at is not null
        ))
      )
  )
);

drop policy if exists report_attachments_write on storage.objects;
create policy report_attachments_write on storage.objects for insert with check (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] like 'report-%'
  and exists (
    select 1 from requests r
    where ('report-' || r.id::text) = (storage.foldername(name))[1] and r.org_id = auth_org() and is_office()
  )
);
