-- 完了報告の添付（画像・PDF）を、案件に割り当てられたスタッフ（dept_leader）も
-- アップロード・閲覧できるようにする。元のポリシー（20261004000003）は is_office()
-- だけを許可していたため、完了報告を書く本人であるスタッフがアップロードできなかった。
-- 案件が見える人の判定は case_visible()（オーナー・受付・担当窓口のマネージャー・
-- 割り当て済みスタッフ）に揃える。依頼主側の条件は変えない。
drop policy if exists completion_report_attachments_read on completion_report_attachments;
create policy completion_report_attachments_read on completion_report_attachments for select using (
  exists (
    select 1 from requests r
    where r.id = completion_report_attachments.request_id
      and r.org_id = auth_org()
      and (
        case_visible(r.customer_id, r.id)
        or (r.customer_id = my_customer_id() and exists (
          select 1 from completion_reports cr where cr.request_id = r.id and cr.sent_at is not null
        ))
      )
  )
);

drop policy if exists completion_report_attachments_write on completion_report_attachments;
create policy completion_report_attachments_write on completion_report_attachments for all using (
  exists (
    select 1 from requests r
    where r.id = completion_report_attachments.request_id and r.org_id = auth_org() and case_visible(r.customer_id, r.id)
  )
);

drop policy if exists report_attachments_read on storage.objects;
create policy report_attachments_read on storage.objects for select using (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] like 'report-%'
  and exists (
    select 1 from requests r
    where ('report-' || r.id::text) = (storage.foldername(name))[1]
      and r.org_id = auth_org()
      and (
        case_visible(r.customer_id, r.id)
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
    where ('report-' || r.id::text) = (storage.foldername(name))[1] and r.org_id = auth_org() and case_visible(r.customer_id, r.id)
  )
);
