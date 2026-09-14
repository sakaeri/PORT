-- 依頼主一覧に「未読」マークを出すための最小限の既読管理。
-- スタッフはログイン共有（会社に1つ）の運用なので、スタッフ個人ごとではなく
-- スレッド単位で「誰かスタッフが最後に見た時刻」を1つ持てば足りる。
alter table threads add column if not exists last_read_at timestamptz;
