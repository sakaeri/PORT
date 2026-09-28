-- 受付メニューと見積もり用の価格表を同じ menus テーブルで兼用しているため、
-- 「労務に関するご相談」のような値段のない相談項目にも今までは price=0 を
-- 入れる必要があり、しかもその0円のまま見積もり画面（QuoteDialog）の
-- 数量選択リストに出てしまっていた。price を null 可にして、「金額を
-- 設定しない＝問い合わせの選択肢としてだけ使う」を表現できるようにする。
-- アプリ側で null の項目は QuoteDialog の選択肢から除外する。
alter table menus alter column price drop not null;
alter table menus alter column price drop default;
