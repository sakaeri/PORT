-- 今日追加した department_visible()/case_visible() は、内部で
-- customer_department_id() を呼んでいる。この関数は
-- 「threads を customer_id で検索する」処理だが、threads テーブルには
-- customer_id 単体のインデックスが無かった（org_id, kind, last_msg_at の
-- 複合インデックスしか無い）。この関数は依頼主一覧・案件一覧など、
-- スタッフ側のほぼ全ての画面のRLS判定で行ごとに呼ばれるため、インデックス
-- が無いと表全体を毎回スキャンすることになり、これが全体的な体感速度の
-- 低下の主な原因になっていたと考えられる。
create index if not exists idx_threads_customer_id on threads (customer_id, kind) where customer_id is not null;

-- 同様に、依頼主自身のログインでの my_customer_id()（customers.profile_id
-- で検索）にもインデックスが無かった。依頼主側の画面の全RLS判定で使われる。
create index if not exists idx_customers_profile_id on customers (profile_id) where profile_id is not null;
