-- PORT本部への問い合わせ（customers 行）から、そのままその依頼主を新しい
-- 事業者として登録できるようにする（事業者管理の「新規事業者を追加」と同じ
-- 処理を、依頼主一覧からワンタップで呼び出す機能のため）。
-- どの依頼主がどの事業者になったかを追跡するための列。
alter table customers add column if not exists converted_org_id uuid references organizations(id) on delete set null;
