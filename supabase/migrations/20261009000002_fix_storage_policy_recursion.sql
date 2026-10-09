-- 添付の合計容量チェック（20260919000001）が attachments_write の中で
-- storage.objects 自身を直接 select していたため、storage.objects への
-- INSERT のたびに「infinite recursion detected in policy for relation
-- "objects"」で失敗していた。INSERT のポリシーは全バケット分がまとめて
-- 評価されるので、添付だけでなくアイコン画像・完了報告の添付も含めて、
-- すべてのアップロードが止まっていた。
-- 合計の計算を security definer 関数に切り出し、ポリシーから storage.objects
-- を直接参照しないようにする（auth_org() などと同じ修正パターン）。
create or replace function attachment_thread_total_bytes(p_thread_id text) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)
  from storage.objects o
  where o.bucket_id = 'attachments'
    and (storage.foldername(o.name))[1] = p_thread_id
$$;

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
          and attachment_thread_total_bytes(t.id::text) < 200 * 1024 * 1024
        )
      )
  )
);
