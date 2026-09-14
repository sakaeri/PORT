-- Realtime(postgres_changes)は、テーブルが supabase_realtime パブリケーションに
-- 追加されていないと購読しても一切イベントが飛んでこない。今まで一度も
-- 追加していなかったため、依頼主アプリ・受付アプリ双方のリアルタイム更新
-- （新着メッセージ・進捗・評価など）が実際には届いていなかった可能性が高い。
-- 何度流しても壊れないよう、既に入っている場合はスキップする。
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'threads') then
    alter publication supabase_realtime add table threads;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'requests') then
    alter publication supabase_realtime add table requests;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'completion_reports') then
    alter publication supabase_realtime add table completion_reports;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ratings') then
    alter publication supabase_realtime add table ratings;
  end if;
end $$;
