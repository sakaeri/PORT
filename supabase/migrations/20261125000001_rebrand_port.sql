-- 中央秘書の事業をやめ、お問い合わせ窓口（PORT）だけにする。
-- 1. 事業所の表示名を「PORT」に（画面上部・通知メールの【】に出る）。
-- 2. 担当者ごとの窓口（departments）の名前「秘書：〇〇」を「担当：〇〇」に。
-- （トップから新しいお問い合わせはもう受けないので、トップ用の最初のあいさつは触らない。）

update organizations set display_name = 'PORT' where display_name like '%中央秘書%';

update departments set name = '担当：' || substr(name, 4) where name like '秘書：%';
