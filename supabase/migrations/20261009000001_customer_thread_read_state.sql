-- 本部→依頼主のメッセージを、依頼主が未読のときだけメールで知らせるための既読管理。
-- 本部側の last_read_at と対になる、依頼主側の「最後にトーク画面で読んだ時刻」。
-- 既存のスレッドは「今まで分は読んだ」扱いで埋めておく（null のままだと、過去の
-- 本部メッセージが全部未読とみなされ、最初の1通のメールが送られなくなるため）。
alter table threads add column if not exists customer_last_read_at timestamptz;
update threads set customer_last_read_at = now() where kind = 'customer' and customer_last_read_at is null;
