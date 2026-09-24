-- 役職を4段階に拡張する準備。既存の 'reception' は残すが、新しいスタッフ
-- 招待画面ではもう使わない（過去互換のためenum自体は消さない）。
--
-- 重要：ADD VALUE した直後の値は、同じトランザクション内では比較などに
-- 使えない（Postgresの制約）。このファイルは必ず単独で実行し、
-- 20260924000003_departments_and_roles_part2.sql は別に分けて実行すること。
alter type app_role add value if not exists 'supervisor';    -- 統括担当：全窓口を閲覧・操作可、削除不可
alter type app_role add value if not exists 'dept_manager';  -- 窓口マネージャー：自分の窓口のみ閲覧・操作・削除可
alter type app_role add value if not exists 'dept_leader';   -- 窓口リーダー：自分の窓口のみ閲覧・操作可、削除不可
