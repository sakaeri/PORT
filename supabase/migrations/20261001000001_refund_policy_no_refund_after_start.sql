-- キャンセル・返金ルールの簡素化：着手後は原則返金なし（既に実働が発生して
-- いるため）。例外は「未着手」（accepted）と「著しい遅延」（terminate、
-- 本部側の責任に相当）の2つだけ全額返金のまま。
-- この表（refund_policies）の仕組み自体は残すが、事業者ごとに%を変更する
-- UIは廃止し、固定ルールとして扱う。既存の全事業者の "started" 段階を
-- 「部分返金50%」から「返金なし」に更新する。
update refund_policies set mode = 'none', pct = 0 where stage = 'started';
