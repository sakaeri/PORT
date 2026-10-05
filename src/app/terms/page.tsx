import type { Metadata } from "next";

export const metadata: Metadata = { title: "利用規約" };

const section: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const heading: React.CSSProperties = { fontFamily: "var(--font-heading)", fontSize: 15, fontWeight: 600 };
const body: React.CSSProperties = { fontSize: 13.5, lineHeight: 1.9, color: "var(--color-text)" };

export default function TermsPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--color-bg)",
        color: "var(--color-text)",
        fontFamily: "var(--font-body)",
        padding: "40px 20px 80px",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 700 }}>利用規約</div>

        <div style={section}>
          <div style={body}>
            この利用規約（以下「本規約」）は、本サービスの提供者（以下「当方」）が本アプリを通じて提供するサービス（チャットでのご相談受付、見積もりの作成、業務の実施、完了報告の提出等。以下「本サービス」）の利用条件を定めるものです。本サービスにご登録・ご利用いただいた時点で、本規約にご同意いただいたものとみなします。
          </div>
        </div>

        <div style={section}>
          <div style={heading}>1. サービス内容</div>
          <div style={body}>
            本サービスは、依頼主からチャットでご相談を受け、内容に応じて見積もりを作成し、依頼主のご承認（お支払い）をもって業務に着手し、完了後に報告をお届けするものです。個別の業務ごとに書面での契約は取り交わさず、本規約および当方が提示する見積もり内容をもって契約条件とします。
          </div>
        </div>

        <div style={section}>
          <div style={heading}>2. 利用登録</div>
          <div style={body}>
            本サービスのご利用には、お名前・メールアドレスのご登録が必要です。登録情報に誤りがあった場合の不利益について、当方は責任を負いません。
          </div>
        </div>

        <div style={section}>
          <div style={heading}>3. 料金・お支払い</div>
          <div style={body}>
            料金は見積もり提示時にお伝えし、依頼主のご承認後、チャージ残高からお支払いいただきます。残高が不足する場合はチャージ（および設定に応じた自動チャージ）が必要です。見積もりにご承認いただいた時点で、お支払い・業務実施の義務が確定します。
          </div>
        </div>

        <div style={section}>
          <div style={heading}>4. キャンセル・返金について</div>
          <div style={body}>
            見積もりのご承認前（お支払い前）であれば、いつでも見送ることができ、費用は一切発生しません。<b>ご承認・お支払い後は、理由の如何を問わずキャンセル・返金はお受けできません。</b>ご承認前に内容・金額を十分にご確認ください。
          </div>
        </div>

        <div style={section}>
          <div style={heading}>5. 禁止事項</div>
          <div style={body}>
            法令または公序良俗に違反する行為、当方・担当スタッフに対する脅迫・嫌がらせ、本サービスの運営を妨げる行為、その他当方が不適切と判断する行為を禁止します。該当する場合、ご利用をお断りすることがあります。
          </div>
        </div>

        <div style={section}>
          <div style={heading}>6. 個人情報の取り扱い</div>
          <div style={body}>
            ご登録いただいた個人情報（お名前・連絡先等）は、本サービスの提供（ご依頼対応・ご連絡・お支払い処理）のためにのみ利用し、業務上必要な範囲を超えて第三者に提供することはありません。業務の性質上、担当スタッフがお客様の情報を知り得る場合がありますが、当方は適切な権限管理のもとで対応いたします。
          </div>
        </div>

        <div style={section}>
          <div style={heading}>7. 免責事項</div>
          <div style={body}>
            当方は、本サービスの提供にあたり善良な管理者の注意をもって対応しますが、天災・通信障害その他の不可抗力により生じた損害について責任を負いません。また、当方の故意または重大な過失による場合を除き、本サービスに起因して依頼主に生じた損害についての賠償責任は、当該業務でお支払いいただいた金額を上限とします。
          </div>
        </div>

        <div style={section}>
          <div style={heading}>8. 本規約の変更</div>
          <div style={body}>
            当方は、必要と判断した場合、本規約を変更することがあります。変更後の規約は、本アプリ上に掲載した時点から効力を生じるものとします。
          </div>
        </div>

        <div style={section}>
          <div style={heading}>9. 準拠法</div>
          <div style={body}>本規約の解釈にあたっては、日本法を準拠法とします。</div>
        </div>
      </div>
    </main>
  );
}
