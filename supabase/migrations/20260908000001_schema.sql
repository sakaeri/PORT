-- 動画制作の窓口（VID） — PostgreSQL / Supabase スキーマ
-- 対象: Supabase (auth.users 前提, RLS は 20_rls.sql)
-- 命名: snake_case, 単数形の型 + 複数形のテーブル, timestamptz, 金額は integer（円・税抜）

create extension if not exists "pgcrypto";

-- ============================================================
-- 列挙型
-- ============================================================
create type app_role as enum ('owner','reception','creator','client');

create type request_phase as enum (
  'draft',      -- 相談中（見積前）
  'quoted',     -- 見積提示済み・返答待ち
  'preparing',  -- 承諾済み・着手前
  'started',    -- 着手済み
  'approved',   -- 対応中（受付確認済み）
  'completed',  -- 完了報告済み
  'cancelled',  -- キャンセル・返金
  'declined'    -- 見送り（費用なし）
);

create type message_kind as enum (
  'text','files','quote','notice','intake_request','off_choice','report','rating','system'
);

create type thread_kind as enum ('customer','case','internal');

create type doc_status as enum ('none','review','ok','reject');

create type refund_stage as enum ('prequote','accepted','started','delivered','terminate');
create type refund_mode  as enum ('nocharge','full','partial','none');

create type agreement_kind as enum ('contract','employment_part','employment_full','nda','consent');
create type pay_mode as enum ('hourly','daily','monthly','menu','share','none');

create type voice_kind as enum ('review','fix','office');
create type office_report_kind as enum ('customer_conduct','harassment','vendor_trouble','other');
create type office_report_status as enum ('open','in_progress','closed','withdrawn');
create type availability_kind as enum ('work','off','off_requested');

create type payment_method as enum ('card','bank');
create type payment_status as enum ('unpaid','processing','paid','refunded','failed');

-- PORT の利用料（事業所 → PORT）。案件の決済（依頼主 → 事業所）とは別物。
create type plan_status as enum ('trial','active','past_due','paused','cancelled');

-- ============================================================
-- テナントと人
-- ============================================================
create table organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                       -- 正式名称（請求書などに出る）
  display_name  text not null,                       -- 依頼主に見える表示名
  rep_name      text,
  address       text,
  tel           text,
  email         text,
  pay_method    text not null default 'card',        -- card | transfer | invoice
  solo          boolean not null default false,      -- true = 1人運用（スタッフ機能を隠す）
  sla_minutes   integer not null default 15,         -- 返信の目安
  terms         jsonb  not null default '{}'::jsonb, -- 利用規約の各条項

  -- PORT の利用料（基本料 + 席数）。売上を数えないので、課金に必要なのは人数だけ。
  plan_status   plan_status not null default 'trial',
  base_fee      integer not null default 4800,       -- 月額の基本料（円）
  seat_price    integer not null default 1500,       -- 制作者1人あたり（円）
  seats         integer not null default 0,          -- 課金対象の制作者数（トリガで同期）
  trial_ends_on date,                                -- 30日間無料の終了日
  referred_by_user_id    uuid,                       -- この事業所を紹介した制作者（自力登録なら null）
  stripe_customer_id     text,                       -- PORT のStripe上の顧客
  stripe_subscription_id text,

  created_at    timestamptz not null default now()
);

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  org_id       uuid not null references organizations(id) on delete cascade,
  role         app_role not null,
  display_name text not null,
  avatar_url   text,
  theme        text not null default 'dark',         -- dark | light
  created_at   timestamptz not null default now()
);
create index on profiles (org_id, role);

-- 依頼主（クライアント）
create table customers (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  profile_id    uuid references profiles(id) on delete set null,  -- アプリにログインする場合
  name          text not null,
  member_no     text unique,
  creator_id    uuid,                                -- 専任の制作者（後段で FK）
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index on customers (org_id, active);

-- 依頼主の預かり情報（電話番号・請求書の宛名など）
create table customer_vault_items (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  label       text not null,
  value       text not null default '',
  sort        integer not null default 0,
  updated_at  timestamptz not null default now()
);
create index on customer_vault_items (customer_id, sort);

-- 制作者（スタッフ）
create table creators (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  wip_limit   integer not null default 3,            -- 受け入れ上限
  bio         text,
  joined_on   date,
  active      boolean not null default true,
  unique (org_id, profile_id)
);

alter table customers
  add constraint customers_creator_fk
  foreign key (creator_id) references creators(id) on delete set null;

-- ============================================================
-- メニューと受付の設定
-- ============================================================
create table menus (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  label       text not null,
  note        text,
  icon        text,                                   -- Phosphor のクラス名
  price       integer not null default 0,             -- 依頼主への請求額
  payout      integer not null default 0,             -- 制作者への既定報酬
  lead_hours  integer not null default 24,
  sort        integer not null default 0,
  active      boolean not null default true
);
create index on menus (org_id, sort);

-- メニューごとに確認したい質問（順序つきの文字列）
create table menu_questions (
  id       uuid primary key default gen_random_uuid(),
  menu_id  uuid not null references menus(id) on delete cascade,
  label    text not null,
  sort     integer not null default 0
);

-- 確認事項テンプレ。save_answers=false は「送るだけの定型文」
create table intake_forms (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  label         text not null,
  note          text,
  icon          text,
  body          text,                                 -- 定型文型の本文
  save_answers  boolean not null default true,
  sort          integer not null default 0
);

create table intake_fields (
  id        uuid primary key default gen_random_uuid(),
  form_id   uuid not null references intake_forms(id) on delete cascade,
  key       text not null,
  label     text not null,
  kind      text not null default 'text',             -- text | tel | email | date | textarea | select
  required  boolean not null default false,
  sort      integer not null default 0,
  unique (form_id, key)
);

-- 依頼主の回答（次回以降の自動引き当て元）
create table customer_answers (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  field_key    text not null,
  label        text not null,
  value        text not null default '',
  verified_at  timestamptz,                            -- 受付が照合すると「確認済み」
  updated_at   timestamptz not null default now(),
  unique (customer_id, field_key)
);

create table refund_policies (
  org_id  uuid not null references organizations(id) on delete cascade,
  stage   refund_stage not null,
  mode    refund_mode  not null,
  pct     integer not null default 0 check (pct between 0 and 100),
  primary key (org_id, stage)
);

-- ============================================================
-- 契約書
-- ============================================================
create table agreements (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  label       text not null,
  kind        agreement_kind not null default 'contract',
  start_on    date,
  open_term   boolean not null default true,           -- true=期間の定めなし
  end_on      date,
  scope       text,
  pay_mode    pay_mode not null default 'hourly',
  pay_fixed   integer,                                 -- 時給/日給/月給の額
  pay_pct     integer,                                 -- 請求額シェアの%
  close_day   text default '月末',
  pay_day     text default '翌月15日',
  pay_method  text default '振込',
  body_text   text,                                    -- 設定から生成した条文
  created_at  timestamptz not null default now()
);

create table agreement_extras (
  agreement_id uuid not null references agreements(id) on delete cascade,
  clause       text not null,
  primary key (agreement_id, clause)
);

create table creator_agreements (
  creator_id   uuid not null references creators(id) on delete cascade,
  agreement_id uuid not null references agreements(id) on delete cascade,
  signed_at    timestamptz,
  primary key (creator_id, agreement_id)
);

-- ============================================================
-- 制作者の設定・稼働・書類・報酬
-- ============================================================
create table creator_skills (
  creator_id uuid not null references creators(id) on delete cascade,
  menu_id    uuid not null references menus(id) on delete cascade,
  level      smallint not null default 1 check (level between 0 and 2), -- 0 不可 / 1 対応可 / 2 得意
  primary key (creator_id, menu_id)
);

create table creator_tags (
  creator_id uuid not null references creators(id) on delete cascade,
  tag        text not null,
  primary key (creator_id, tag)
);

-- メニュー別の報酬単価（契約が menu / share のときだけ使う）
create table creator_rates (
  creator_id uuid not null references creators(id) on delete cascade,
  menu_id    uuid not null references menus(id) on delete cascade,
  amount     integer not null default 0,
  effective_on date not null default current_date,
  primary key (creator_id, menu_id, effective_on)
);

create table creator_availability (
  id         uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  on_date    date not null,
  kind       availability_kind not null default 'work',
  note       text,
  approved_at timestamptz,
  unique (creator_id, on_date)
);

create table creator_documents (
  id         uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  kind       text not null,                            -- 本人確認 / 口座 / 契約書 など
  status     doc_status not null default 'none',
  file_path  text,                                     -- storage のパス
  note       text,                                     -- 差し戻し理由
  updated_at timestamptz not null default now(),
  unique (creator_id, kind)
);

create table payout_statements (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references creators(id) on delete cascade,
  period      date not null,                           -- 対象月の1日
  total       integer not null default 0,
  confirmed_at timestamptz,                            -- 制作者が明細を確認
  paid_at     timestamptz,                             -- 受付が支払確定
  unique (creator_id, period)
);

create table payout_lines (
  id           uuid primary key default gen_random_uuid(),
  statement_id uuid not null references payout_statements(id) on delete cascade,
  request_id   uuid,                                   -- 後段で FK
  worked_on    date not null,
  customer_label text not null,
  task_label   text not null,
  amount       integer not null
);

-- ============================================================
-- 案件
-- ============================================================
create table requests (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  customer_id  uuid not null references customers(id) on delete cascade,
  creator_id   uuid references creators(id) on delete set null,
  title        text not null,
  note         text,
  phase        request_phase not null default 'draft',
  amount       integer not null default 0,             -- 請求額
  payout       integer not null default 0,             -- 制作者報酬
  work_minutes integer,                                -- 作業目安
  lead_hours   integer,
  due_at       timestamptz,
  refund_pct   integer,                                -- キャンセル時に確定した返金率
  quoted_at    timestamptz,
  accepted_at  timestamptz,
  pay_method   payment_method,                         -- 依頼主が選んだ支払い方法
  pay_status   payment_status not null default 'unpaid',
  stripe_payment_intent_id text,                       -- card のみ。事業主のStripeアカウント上のID
  stripe_fee_amount integer,                           -- うちが受け取る手数料（application fee, 円）
  paid_at      timestamptz,                            -- card は webhook / bank は受付が手動で確定
  paid_marked_by uuid references profiles(id),         -- bank のとき、入金確認した受付
  refunded_amount integer not null default 0,
  started_at   timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at   timestamptz not null default now()
);
create index on requests (org_id, phase);
create index on requests (customer_id, created_at desc);
create index on requests (creator_id, phase);

alter table payout_lines
  add constraint payout_lines_request_fk
  foreign key (request_id) references requests(id) on delete set null;

create table request_items (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  menu_id    uuid references menus(id) on delete set null,
  label      text not null,                            -- メニュー外はここに自由記述
  price      integer not null default 0,
  payout     integer not null default 0,
  qty        integer not null default 1,
  sort       integer not null default 0
);

-- ============================================================
-- トークとメッセージ
-- ============================================================
-- kind=customer: 依頼主 ↔ 受付 / kind=case: 案件の内部トーク / kind=internal: 受付 ↔ 制作者
create table threads (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  kind        thread_kind not null,
  customer_id uuid references customers(id) on delete cascade,
  request_id  uuid references requests(id) on delete cascade,
  creator_id  uuid references creators(id) on delete cascade,
  last_msg_at timestamptz,
  created_at  timestamptz not null default now()
);
create index on threads (org_id, kind, last_msg_at desc);

create table messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references threads(id) on delete cascade,
  sender_id   uuid references profiles(id) on delete set null, -- null = システム
  sender_role app_role,
  kind        message_kind not null default 'text',
  body        text,
  payload     jsonb not null default '{}'::jsonb,  -- quote/report/intake などカード固有の内容
  request_id  uuid references requests(id) on delete set null,
  sent_at     timestamptz not null default now(),
  edited_at   timestamptz
);
create index on messages (thread_id, sent_at);
create index on messages (request_id);

create table message_reads (
  message_id uuid not null references messages(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (message_id, profile_id)
);

create table message_attachments (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  file_path  text not null,
  file_name  text not null,
  mime       text,
  bytes      bigint
);

-- ============================================================
-- 完了報告・評価・お客様の声
-- ============================================================
create table completion_reports (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references requests(id) on delete cascade,
  creator_id      uuid references creators(id) on delete set null,
  summary         text not null,
  details         jsonb not null default '[]'::jsonb,  -- [{label, value}] 依頼主に見える明細
  revisions_left  integer,
  note_to_customer text,
  -- 動画そのものは持たない。ギガファイル便などの外部リンクで受け渡す
  delivery_url    text,
  delivery_expires_on date,                            -- 外部サービスの保管期限
  delivery_note   text,                                -- パスワードや解凍方法など
  submitted_at    timestamptz not null default now(),
  sent_at         timestamptz                          -- 受付が依頼主に送った時刻
);
create index on completion_reports (request_id);

-- 依頼主の評価。★は制作者に開示しない（RLS で担保）
create table ratings (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references requests(id) on delete cascade,
  customer_id  uuid not null references customers(id) on delete cascade,
  stars        smallint check (stars between 1 and 5),
  comment      text,
  skipped      boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (request_id)
);
create index on ratings (customer_id, created_at desc);

-- 受付が明示的に共有したものだけが制作者に届く
create table creator_voices (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references creators(id) on delete cascade,
  kind        voice_kind not null,
  body        text not null,                           -- 依頼主の原文（編集しない）
  rating_id   uuid references ratings(id) on delete set null,
  shared_by   uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on creator_voices (creator_id, created_at desc);

-- 作業メモ。追記のみ（UPDATE を許可しない）。依頼主には見せない
create table work_memos (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  request_id  uuid references requests(id) on delete set null,
  author_id   uuid not null references profiles(id) on delete restrict,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index on work_memos (customer_id, created_at desc);

-- ============================================================
-- 紹介（制作者 → 依頼主 → 新しい事業所）
-- ============================================================
-- 無料月は「チケット1行 = 1ヶ月」。金額計算も現金還元もしないので、
-- 残枚数は status = 'confirmed' の行数を数えるだけで出ます。
create type referral_status as enum (
  'pending',    -- 紹介先がまだ30日トライアル中（使えない）
  'confirmed',  -- 初回課金が通った。使える1枚
  'consumed',   -- ある請求月に1枚使った
  'revoked'     -- 不正・解約などで無効
);

create table referral_credits (
  id                     uuid primary key default gen_random_uuid(),
  referrer_user_id       uuid not null references profiles(id) on delete cascade,
  referrer_org_id        uuid not null references organizations(id) on delete cascade,
  referred_org_id        uuid not null references organizations(id) on delete cascade,
  status                 referral_status not null default 'pending',
  confirmed_at           timestamptz,                 -- 紹介先の初回課金が通った時刻
  consumed_billing_month date,                        -- 使った請求月（月初日で入れる）
  created_at             timestamptz not null default now(),
  -- 同じ事業所を複数人が紹介しても1枚だけ。自己紹介も不可。
  unique (referred_org_id),
  check (referrer_org_id <> referred_org_id)
);
create index on referral_credits (referrer_user_id, status);

alter table organizations
  add constraint organizations_referred_by_fk
  foreign key (referred_by_user_id) references profiles(id) on delete set null;

-- ============================================================
-- 席数の同期（制作者の有効/停止に追随。Stripe側の数量はこの値を webhook で送る）
-- ============================================================
create or replace function sync_org_seats() returns trigger language plpgsql as $$
declare target uuid;
begin
  target := coalesce(new.org_id, old.org_id);
  update organizations o
     set seats = (
       select count(*) from creators c
        where c.org_id = target and c.active
     )
   where o.id = target;
  return null;
end $$;

create trigger creators_seat_sync
  after insert or update of active, org_id or delete on creators
  for each row execute function sync_org_seats();

-- ============================================================
-- 決済アカウント（Stripe Connect Standard = 事業主が自分でStripeと契約）
-- ============================================================
create table payment_accounts (
  org_id                uuid primary key references organizations(id) on delete cascade,
  stripe_account_id     text unique,                   -- acct_xxx（事業主のアカウント）
  charges_enabled       boolean not null default false,
  payouts_enabled       boolean not null default false,
  application_fee_bps   integer not null default 0,    -- うちの手数料（ベーシスポイント）
  accepts_card          boolean not null default false,
  accepts_bank          boolean not null default true,
  bank_note             text,                          -- 振込先の案内文（依頼主に表示）
  connected_at          timestamptz,
  updated_at            timestamptz not null default now()
);

-- ============================================================
-- SLA と 事務局への報告
-- ============================================================
create table sla_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  message_id  uuid not null references messages(id) on delete cascade,
  creator_id  uuid references creators(id) on delete set null,
  waited_min  integer not null,                        -- 依頼主の発言から制作者の返信までの分
  breached    boolean not null default false,          -- 15分の返信目安を超えたか
  excused     boolean not null default false,          -- 営業時間外・定休日・休み申請中・代理対応中
  excuse_note text,
  created_at  timestamptz not null default now(),
  unique (message_id)
);
create index on sla_events (creator_id, created_at desc);
-- 減点ポイントの台帳は持ちません。SLA は「未返信の可視化」と受付の集計のみに使います。

create table office_reports (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  creator_id  uuid not null references creators(id) on delete cascade,
  kind        office_report_kind not null,
  body        text not null,
  thread_id   uuid references threads(id) on delete set null,  -- 該当トークの自動添付
  status      office_report_status not null default 'open',
  sla_paused  boolean not null default false,          -- ハラスメント時は返信義務を停止
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);
create index on office_reports (org_id, status);

-- ============================================================
-- 追記のみを DB 側で担保
-- ============================================================
create or replace function forbid_update() returns trigger language plpgsql as $$
begin
  raise exception '% は追記のみです（更新できません）', tg_table_name;
end $$;

create trigger work_memos_no_update before update on work_memos
  for each row execute function forbid_update();
create trigger creator_voices_no_update before update on creator_voices
  for each row execute function forbid_update();
