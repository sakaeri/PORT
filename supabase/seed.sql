-- ローカル開発用シード。design_handoff_vid/db/30_seed.sql のデモデータを元に、
-- auth.users を先に作ってから profiles 以下を投入する。
begin;

-- ---------- auth.users（固定UUID。ローカル専用のダミーパスワード） ----------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_anonymous
) values
 ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000000b1','authenticated','authenticated',
  'owner@example.jp', crypt('devpassword', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}','{}', false),
 ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000000b2','authenticated','authenticated',
  'reception@example.jp', crypt('devpassword', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}','{}', false),
 ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000000c1','authenticated','authenticated',
  'creator1@example.jp', crypt('devpassword', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}','{}', false),
 ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000000c2','authenticated','authenticated',
  'creator2@example.jp', crypt('devpassword', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}','{}', false),
 ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000000c3','authenticated','authenticated',
  'creator3@example.jp', crypt('devpassword', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}','{}', false),
 ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000000d1','authenticated','authenticated',
  'client1@example.jp', crypt('devpassword', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}','{}', false)
on conflict (id) do nothing;

-- ---------- organizations / profiles / creators / menus / ... ----------
insert into organizations (id, name, display_name, rep_name, address, tel, email, pay_method, solo)
values ('00000000-0000-0000-0000-0000000000a1',
        '株式会社S-Style', '動画制作の窓口', '田中 誠',
        '東京都大田区蒲田5-1-8 蒲田ビル3F', '03-5555-0100', 'info@example.jp', 'card', false)
on conflict (id) do nothing;

update app_config set default_org_id = '00000000-0000-0000-0000-0000000000a1';

insert into profiles (id, org_id, role, display_name) values
 ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','owner','田中 誠'),
 ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000a1','reception','受付 佐藤'),
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','creator','井上 恵子'),
 ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a1','creator','宮本 拓'),
 ('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000a1','creator','小林 遥'),
 ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a1','client','合同会社ミナト商会')
on conflict (id) do nothing;

insert into creators (id, org_id, profile_id, wip_limit, active) values
 ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1',4,true),
 ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c2',3,true),
 ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c3',3,true)
on conflict (id) do nothing;

insert into menus (id, org_id, label, note, icon, price, payout, lead_hours, sort) values
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','SNS縦動画の編集','60秒まで・字幕込みで1本','ph ph-device-mobile',3500,1500,6,1),
 ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000a1','YouTube用の編集','15分まで・テロップと概要欄つき','ph ph-youtube-logo',6000,2200,24,2),
 ('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000a1','企業VP・会社紹介','3分まで・構成案から書き出しまで','ph ph-buildings',9000,2200,24,3),
 ('00000000-0000-0000-0000-0000000000f4','00000000-0000-0000-0000-0000000000a1','サムネイル制作','3案提示から1案の仕上げまで','ph ph-image',2500,900,3,4),
 ('00000000-0000-0000-0000-0000000000f5','00000000-0000-0000-0000-0000000000a1','字幕・テロップのみ','支給の動画に字幕データを作成','ph ph-subtitles',4000,1800,48,5),
 ('00000000-0000-0000-0000-0000000000f6','00000000-0000-0000-0000-0000000000a1','修正対応（追加分）','メニュー上限を超える修正1回','ph ph-arrows-clockwise',3800,2600,24,6)
on conflict (id) do nothing;

insert into menu_questions (menu_id, label, sort) values
 ('00000000-0000-0000-0000-0000000000f1','本数と1本の尺',1),
 ('00000000-0000-0000-0000-0000000000f1','投稿先（TikTok / Reels など）',2),
 ('00000000-0000-0000-0000-0000000000f1','字幕の有無',3),
 ('00000000-0000-0000-0000-0000000000f1','素材の場所（ドライブのURLなど）',4),
 ('00000000-0000-0000-0000-0000000000f1','ご希望の納期',5),
 ('00000000-0000-0000-0000-0000000000f2','素材の長さと仕上がりの目安',1),
 ('00000000-0000-0000-0000-0000000000f2','字幕・BGMの有無',2),
 ('00000000-0000-0000-0000-0000000000f2','素材の場所',3),
 ('00000000-0000-0000-0000-0000000000f2','ご希望の納期',4),
 ('00000000-0000-0000-0000-0000000000f4','枚数',1),
 ('00000000-0000-0000-0000-0000000000f4','入れたい文字',2),
 ('00000000-0000-0000-0000-0000000000f4','素材の場所',3),
 ('00000000-0000-0000-0000-0000000000f4','参考にしたい雰囲気',4);

insert into refund_policies (org_id, stage, mode, pct) values
 ('00000000-0000-0000-0000-0000000000a1','prequote','nocharge',0),
 ('00000000-0000-0000-0000-0000000000a1','accepted','full',100),
 ('00000000-0000-0000-0000-0000000000a1','started','partial',50),
 ('00000000-0000-0000-0000-0000000000a1','delivered','none',0),
 ('00000000-0000-0000-0000-0000000000a1','terminate','full',100)
on conflict (org_id, stage) do nothing;

-- ---------- 依頼主（デモ用の既存客） ----------
insert into customers (id, org_id, profile_id, name, member_no, creator_id) values
 ('00000000-0000-0000-0000-00000000012a','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','合同会社ミナト商会','C-000001','00000000-0000-0000-0000-0000000000e1')
on conflict (id) do nothing;

-- customer_no_seq はこのデモ会員番号より後から発番させる
select setval('customer_no_seq', 1, true);

insert into customer_vault_items (customer_id, label, value, sort) values
 ('00000000-0000-0000-0000-00000000012a','電話番号','03-5555-0180',1),
 ('00000000-0000-0000-0000-00000000012a','請求書の宛名','合同会社ミナト商会 御中',2);

insert into requests (id, org_id, customer_id, creator_id, title, note, phase, amount, payout, work_minutes, lead_hours, due_at, quoted_at)
values
 ('00000000-0000-0000-0000-00000000013a','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000012a','00000000-0000-0000-0000-0000000000e1',
  '新商品紹介のショート3本','60秒×3本・字幕あり','started',10500,4500,135,6,'2026-09-06T18:00:00+09','2026-09-04T11:30:00+09');

insert into request_items (request_id, menu_id, label, price, payout, qty, sort) values
 ('00000000-0000-0000-0000-00000000013a','00000000-0000-0000-0000-0000000000f1','SNS縦動画の編集',3500,1500,3,1);

insert into threads (id, org_id, kind, customer_id, request_id, last_msg_at) values
 ('00000000-0000-0000-0000-00000000014a','00000000-0000-0000-0000-0000000000a1','customer','00000000-0000-0000-0000-00000000012a',null,'2026-09-05T11:40:00+09')
on conflict (id) do nothing;

insert into messages (thread_id, sender_id, sender_role, kind, body, payload, request_id, sent_at) values
 ('00000000-0000-0000-0000-00000000014a','00000000-0000-0000-0000-0000000000d1','client','text','新商品のショート動画を3本お願いしたいです。','{}','00000000-0000-0000-0000-00000000013a','2026-09-04T11:10:00+09'),
 ('00000000-0000-0000-0000-00000000014a','00000000-0000-0000-0000-0000000000b2','reception','quote','お見積もりをお送りします。',
  '{"title":"新商品紹介のショート3本","note":"","items":[{"label":"SNS縦動画の編集","price":3500,"qty":3}],"total":10500,"work_minutes":135,"due":"9/6（日）18:00"}',
  '00000000-0000-0000-0000-00000000013a','2026-09-04T11:30:00+09'),
 ('00000000-0000-0000-0000-00000000014a','00000000-0000-0000-0000-0000000000b2','reception','notice','担当が着手しました。','{}','00000000-0000-0000-0000-00000000013a','2026-09-04T13:00:00+09');

commit;
