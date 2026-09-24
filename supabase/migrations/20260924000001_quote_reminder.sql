-- 見積放置リマインドのcronが、同じ見積に対して毎日重複して送らないための
-- 送信済みフラグ。
alter table requests add column if not exists reminder_sent_at timestamptz;
