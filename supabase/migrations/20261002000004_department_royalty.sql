-- 組織は1つだけで、窓口（department）がマネージャー（本部社員でもFC運営者
-- でも区別しない）の単位になった方針転換に伴い、ロイヤリティ（本部が
-- マネージャーから取る歩合）も organizations.royalty_pct ではなく、
-- 窓口ごとに設定できるようにする。nullなら対象外（本部直轄の窓口など）。
-- organizations.royalty_pct 自体は、PORTを外部に販売していた頃の名残の
-- 「事業者（organizations）」単位の画面（/orgs）でまだ参照しているため残す。
alter table departments add column if not exists royalty_pct integer;
