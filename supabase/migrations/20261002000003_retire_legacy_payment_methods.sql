-- 支払い方法を残高払いに一本化したことに伴う片付け。
--
-- requests 側の古い支払い方法専用カラム（payment_timing の
-- prepay_full/deposit/before_shipping/postpay、deposit_*、
-- bank_transfer_info、card_payment_link、final_card_payment_link、
-- pay_method）は、過去に作られた案件のデータを保全するためあえて残す
-- （payment_timing の列挙値自体もPostgres上は削除できない）。アプリ側の
-- コードはもう新しくこれらの値・カラムを使わない。
--
-- 一方で、事業所の「決済設定」そのもの（カード決済の有効/無効・銀行振込の
-- デフォルト振込先・保存済みのカード決済リンク一覧）は、特定の案件の
-- 履歴データではなく単なる設定なので、ここで削除する。
drop table if exists card_payment_links;
alter table organizations drop column if exists card_payment_enabled;
alter table organizations drop column if exists bank_transfer_info;
