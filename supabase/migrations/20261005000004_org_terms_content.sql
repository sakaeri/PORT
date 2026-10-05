-- 利用規約の本文を、コード変更なしで本部が編集できるようにする。
-- nullの間はアプリ側の既定文言（たたき台）を表示する。
alter table organizations add column if not exists terms_content text;
