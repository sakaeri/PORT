-- 添付ファイルの合計容量に上限を設ける（依頼主1人＝1スレッドあたり）。
-- 1ファイルごとの上限（20MB、アプリ側でチェック）とは別に、依頼主が
-- 悪意的に大量のファイルを送り続けて容量を無限に消費するのを防ぐための、
-- Storage側での最終防波堤。スタッフ（is_office）のアップロードは対象外
-- （信頼できる認証済みアカウントのため）。
drop policy if exists attachments_write on storage.objects;
create policy attachments_write on storage.objects for insert with check (
  bucket_id = 'attachments'
  and exists (
    select 1 from threads t
    where t.id::text = (storage.foldername(name))[1]
      and t.org_id = auth_org()
      and (
        is_office()
        or (
          t.kind = 'customer' and t.customer_id = my_customer_id()
          and coalesce(
            (select sum((o.metadata->>'size')::bigint)
             from storage.objects o
             where o.bucket_id = 'attachments'
               and (storage.foldername(o.name))[1] = t.id::text),
            0
          ) < 200 * 1024 * 1024
        )
      )
  )
);
