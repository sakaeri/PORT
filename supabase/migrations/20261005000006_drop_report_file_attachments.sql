-- 完了報告・チャットの画像/PDF添付機能を廃止する（撮影・作成の手間に見合わず、
-- かつSupabase側のストレージ不具合で現状アップロード自体ができないため）。
-- 既存の添付データ・過去メッセージの表示は壊さず、新規の添付だけをやめる。

-- 定型項目の「種類」を画像/PDFからテキストに戻す（「納品物」など）。
update report_field_presets set kind = 'text' where kind in ('image', 'pdf');
alter table report_field_presets drop constraint if exists report_field_presets_kind_check;
alter table report_field_presets add constraint report_field_presets_kind_check check (kind in ('text', 'url'));
