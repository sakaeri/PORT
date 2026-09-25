-- 「本人が決めた本当の名前（display_name）」と「オーナー・マネージャーが
-- 管理用に付ける呼び方（staff_alias）」を分ける。LINEのニックネームと
-- 同じ発想：他人が付けた呼び方は、本人の display_name 自体を書き換えない。
-- 本人以外の画面（スタッフ一覧・案件の担当者表示・社内メモの署名など）は
-- staff_alias があればそれを、無ければ display_name を表示する。本人自身の
-- 画面（サイドバーの自分の名前）は常に display_name（本人が変更したもの）。
alter table profiles add column if not exists staff_alias text;
