-- 「はじめの質問」（menu_questions）は、依頼主側のメニュー選択フロー
-- （MenuSheet）が廃止された際に表示先を失っており、編集画面はあるのに
-- 実際には一切表示されない機能になっていたため、丸ごと削除する。
drop table if exists menu_questions;

-- refund_policies も、キャンセル・返金機能自体を廃止した際の削除漏れ
-- （「あとそもそも『キャンセル』自体一切なしにしない？」の対応）。
-- どこからも参照されていない。
drop table if exists refund_policies;
drop type if exists refund_stage;
drop type if exists refund_mode;
