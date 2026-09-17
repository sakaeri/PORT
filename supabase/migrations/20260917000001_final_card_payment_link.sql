-- 予約金＋カード決済のとき、最初のカード決済リンクは予約金専用の金額で
-- 固定されているため、残金分は別のリンクとして案内する必要がある。
-- 受付が案件詳細から残金用のリンクを登録し、依頼主のトークに表示する。
alter table requests add column if not exists final_card_payment_link text;
