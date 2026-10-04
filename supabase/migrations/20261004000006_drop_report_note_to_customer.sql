-- 完了報告の「依頼主へのメッセージ（任意）」は、実際には依頼主側の画面に
-- 一度も表示されておらず、対応内容の要約と役割が重複して紛らわしいだけ
-- だったため、項目ごと削除する。
alter table completion_reports drop column if exists note_to_customer;
