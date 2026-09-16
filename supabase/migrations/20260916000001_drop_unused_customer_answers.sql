-- customer_answers は「テンプレ回答を覚えておく」用に作られたが、実装では
-- 一度も使われず（実際の保存は customer_vault_items 経由だった。それも
-- 20260915000004 で廃止済み）、完全に未使用のまま残っていた。
-- intake_forms.save_answers もこの機能専用のフラグで、同じく未使用。
-- 両方とも使う予定がないため削除する。
drop table if exists customer_answers cascade;
alter table intake_forms drop column if exists save_answers;
