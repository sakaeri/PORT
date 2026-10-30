import type { Metadata } from "next";

export const metadata: Metadata = { title: "特定商取引法に基づく表記" };

// ネットで代金を受け取るサービスとして必要な表記。キャンセル・返金の扱いは
// 利用規約（/terms の「4. キャンセル・返金について」）と食い違わないようにする。
const ROWS: { label: string; value: string }[] = [
  { label: "販売事業者", value: "中央秘書事務所" },
  { label: "運営責任者", value: "榮 恵里香" },
  { label: "所在地", value: "ご請求があれば遅滞なく開示いたします。" },
  { label: "電話番号", value: "ご請求があれば遅滞なく開示いたします。" },
  { label: "メールアドレス", value: "hello.stb.app@gmail.com" },
  { label: "販売価格", value: "ご依頼の内容に応じて、その都度トーク上でお見積りします（表示価格はすべて税込です）。" },
  {
    label: "商品代金以外の必要料金",
    value: "実費の支払い代行（立替）をご依頼の場合は、実費と立替手数料がかかります。インターネットの通信料はお客様のご負担となります。",
  },
  { label: "お支払い方法", value: "クレジットカード（事前にチャージした残高からのお支払い）" },
  {
    label: "お支払い時期",
    value:
      "チャージはお申し込み時にお支払いいただきます（カードの引き落とし日は各カード会社の規定によります）。各ご依頼の代金は、お見積りを確定した時点でチャージ残高から差し引きます。定期のご依頼は、各回の引き落とし日に差し引きます。",
  },
  {
    label: "サービスの提供時期",
    value: "お見積りの確定後、お見積りに記載した完了予定日までに対応します。定期のご依頼は、お見積りに記載した周期ごとに対応します。",
  },
  {
    label: "キャンセル・返金",
    value:
      "お見積りの確定前（お支払い前）であれば、費用はかかりません。サービスの性質上、お見積りの確定後は、着手の前後を問わずキャンセル・返金はお受けしておりません。チャージ残高の現金での払い戻しはいたしません。",
  },
];

export default function LegalPage() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)", padding: "40px 20px 80px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 700 }}>特定商取引法に基づく表記</div>
        <dl style={{ margin: 0, display: "flex", flexDirection: "column", borderTop: "1px solid var(--color-divider)" }}>
          {ROWS.map((r) => (
            <div key={r.label} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "14px 0", borderBottom: "1px solid var(--color-divider)" }}>
              <dt style={{ fontSize: 12, color: "var(--color-neutral-400)" }}>{r.label}</dt>
              <dd style={{ margin: 0, fontSize: 13.5, lineHeight: 1.8 }}>{r.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </main>
  );
}
