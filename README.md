# VID-client — 依頼主向けトーク画面

Claude Design のハンドオフ（`project/VID-client.dc.html` ほか）を、Next.js (App
Router) + TypeScript + Supabase で実装したもの。Vercel へのデプロイを前提にして
いる。

## セットアップ

1. Supabase プロジェクトを作成する。
2. `supabase/migrations/*.sql` を順番に適用する（`supabase db push`、または
   ダッシュボードの SQL Editor に順番に貼り付け）。続けて `supabase/seed.sql`
   を実行するとデモ用の事業所・メニュー・依頼主データが入る。
3. `app_config` テーブルの `default_org_id` を、実際に使う事業所の
   `organizations.id` に更新する（seed 済みの場合は自動で設定済み）。新規の
   匿名依頼主はここで指定した事業所に自動で紐づく（現状はシングルテナント
   構成）。
4. Supabase の **Authentication → Providers → Anonymous sign-ins** を有効にする
   （依頼主はサインアップ画面なしでチャットを開いた瞬間にログインする設計）。
5. `.env.local.example` を `.env.local` にコピーし、Project Settings → API の
   値を入れる。
6. `npm install && npm run dev`。

Vercel にデプロイする場合は同じ3つの環境変数をプロジェクト設定に登録する
（`SUPABASE_SERVICE_ROLE_KEY` は Server の環境変数としてのみ。フロントに
漏れないよう `NEXT_PUBLIC_` を絶対に付けないこと）。

## 実装できたもの

- チャット本体（テキスト・ファイル添付・お知らせ・メニュー問い合わせカード）
- 見積カード〜進捗〜完了報告〜評価（★必須＋任意コメント＋スキップ）が1枚の
  カードとして連続する構造
- キャンセル／返金額の自動計算（`refund_policies` に基づく段階判定。着手前は
  全額、着手後は50%、目安を大幅に超過した場合は全額保護）
- 情報の預かり（vault）— 受付が指定した項目カードに入力すると、トークには
  残らずプロフィールに保存される
- マイページ（会員番号、お名前の初回登録＋以降は「変更を依頼」、メール変更、
  預かり情報の編集、担当交代の申し出、PORT紹介ブロック）
- 決済前の一度きりの登録（決済ボタンを押した瞬間だけ氏名・メールを聞く。
  匿名セッション→本登録への昇格は Supabase Anonymous Sign-ins を利用）
- RLS: 依頼主は自分のスレッド／案件しか読み書きできない。評価の★は
  制作者向けの SELECT ポリシーを一切作っていないため、制作者アプリ側から
  構造的に見えない
- Realtime（Supabase Realtime）で見積・進捗・完了報告・評価の変化を購読

## 意図的に作らなかったもの（要確認）

- **定休日・営業時間外の「急ぎ／次の出勤日」選択カード**: プロトタイプには
  あるが、これを支える営業時間・定休日のテーブルが `db/10_schema.sql` に
  存在しない。ハードコードで作ると「データではなく決め打ちのUI」になって
  しまうため、事務局（受付）アプリ側で営業時間・定休日を設定できるように
  なってから追加するのが良い。
- **カード情報の登録ダイアログ**: Stripe Connect が未接続のため、実際に
  課金されないカード番号フォームを作るのは誤解を招くと判断し、支払いは
  「決済して依頼する」を押すと即時確定するモックのみにした。Stripe Connect
  Standard 導入後、`src/app/actions.ts` の `payRequest` / `cancelRequest` を
  実際の PaymentIntent 作成・webhook 確定・返金APIに置き換える。
- **依頼主の緊急度エスカレーション（「急ぎに変更」バー、文中の「急ぎ」語検出）**:
  上記の定休日機能とセットの仕様なので同時に見送った。
- プロトタイプの `.dc.html` に定義だけあってどこからも呼ばれていなかった
  機能（別チャンネル `officeMessages` への切替）は実装していない。テーマ
  切替ボタンと「担当交代を申し出る」ボタンは README の仕様どおり存在すべき
  なのに `.dc.html`側でボタンが外れていたため、ロジックはそのまま活かして
  ボタンを復元した。

## ローカルでのDB検証について

このサンドボックスには Docker デーモンが無く `supabase start` が使えなかった
ため、`scripts/db-smoke-test-stubs.sql` で `auth.*` / `storage.*` の最小限を
ローカル Postgres 上にスタブし、実際に `supabase/migrations/*.sql` を適用して
RLS の再帰バグ（後述）やポリシーの穴を検出・修正した。本番の Supabase では
このスタブは使わない（`auth`/`storage` は Supabase が提供する）。

見つけて直したもの:
- `auth_org()` / `is_office()` などのヘルパー関数が `profiles` 等の
  RLS対象テーブルを素の SQL 関数で再帰的に読んでおり、行数が少ないテーブルで
  seq scan になると無限再帰して `stack depth limit exceeded` になるバグ →
  `security definer` に変更して修正
- `messages` の RLS が「スレッドが存在すること」しかチェックしておらず、
  他人のスレッドにも読み書きできる穴があったため、`threads` の可視範囲と
  揃えて締めた
- 依頼主が受付の表示名を読めない、依頼主の初回名乗り（決済前の1回きりの
  自己申告）ができない、といった抜けを追加ポリシーで補った

(`supabase/migrations/20260908000003_client_app.sql` にコメント付きでまとめて
ある。)
