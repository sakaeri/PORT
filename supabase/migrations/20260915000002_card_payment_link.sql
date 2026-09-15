-- カード決済は「追ってチャットで送る」ではなく、見積もりにリンクを直接貼れるようにする
-- （送り忘れ防止・依頼主がその場で払えるように）。

alter table organizations
  add column card_payment_link text; -- デフォルトのカード決済リンク（次回の見積もりに自動で入る）

alter table requests
  add column card_payment_link text; -- 見積もり時点のリンクのスナップショット（カード決済を選んだときのみ）
