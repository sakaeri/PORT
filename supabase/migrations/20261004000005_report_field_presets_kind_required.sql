-- 完了報告の定型項目に「種類」（テキスト/URL/画像/PDF）と「必須」フラグを追加。
-- intake_fields の kind/required と同じ考え方（スタッフが報告のとき迷わないよう、
-- 入力の形はその場の自由選択ではなく、プリセット側であらかじめ決めておく）。
alter table report_field_presets add column kind text not null default 'text' check (kind in ('text', 'url', 'image', 'pdf'));
alter table report_field_presets add column required boolean not null default false;

-- 画像・PDF種類の定型項目に紐づけて添付したファイルが、報告書のどの項目に
-- 対応するか分かるようラベルを持たせる（自由添付の場合はnullのまま）。
alter table completion_report_attachments add column label text;
