-- 受付が依頼主とのトークを閲覧・返信できる画面のための土台。
-- messages/threads にはこれまで受付の update/delete ポリシーが一切無く
-- （送信と閲覧のみ可能）、メッセージの非表示・削除もトーク自体の
-- アーカイブ・削除もできなかった。

-- 非表示（hidden_at）: 元に戻せる。依頼主側には一切見せない（下の
-- getThreadMessages 側のフィルタで対応）。受付側では「表示に戻す」で戻せる。
alter table messages add column if not exists hidden_at timestamptz;

-- トークの一覧から一時的に隠す（依頼主には影響しない、受付の一覧整理用）。
alter table threads add column if not exists archived_at timestamptz;

-- messages には元々 select（messages_read）と insert（messages_send）の
-- ポリシーしかなく、受付であっても update/delete が一切できなかった。
create policy messages_office_manage on messages for update using (
  exists (select 1 from threads t where t.id = thread_id and t.org_id = auth_org() and is_office())
);
create policy messages_office_delete on messages for delete using (
  exists (select 1 from threads t where t.id = thread_id and t.org_id = auth_org() and is_office())
);
-- threads は threads_office_write が既に for all (update/delete 含む) を
-- 許可しているので、アーカイブ・トーク削除にポリシーの追加は不要。
