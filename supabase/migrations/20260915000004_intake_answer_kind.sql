-- 返信テンプレ（確認事項）の回答は、依頼主ごとの永続データ（customer_vault_items）には
-- 繋げず、見積もりの「はじめの質問」と同じように、その場のメッセージとしてのみ残す。
-- そのための新しいメッセージ種別。
alter type message_kind add value 'intake_answer';
