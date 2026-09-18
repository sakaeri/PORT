"use client";

export interface OrgAccountFormState {
  name: string;
  display_name: string;
  rep_name: string;
  tel: string;
  email: string;
  slug: string;
  owner_display_name: string;
  owner_email: string;
  owner_password: string;
}

export const EMPTY_ORG_FORM: OrgAccountFormState = {
  name: "",
  display_name: "",
  rep_name: "",
  tel: "",
  email: "",
  slug: "",
  owner_email: "",
  owner_password: "",
  owner_display_name: "",
};

export function randomPassword() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function slugify(v: string) {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Same character rules as slugify(), but keeps a trailing hyphen instead of
// trimming it. slugify() runs on every keystroke would otherwise strip a
// hyphen the moment it's typed (it's the last character until the next one
// is), making it look like "-" simply can't be entered.
function sanitizeSlugInput(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+/, "");
}

const input: React.CSSProperties = {
  width: "100%",
  height: 36,
  padding: "6px 10px",
  fontSize: 13.5,
  color: "var(--color-text)",
  background: "var(--color-bg)",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
  outline: "none",
};
const label: React.CSSProperties = { fontSize: 12, color: "var(--color-neutral-500)" };
const smallBtn: React.CSSProperties = {
  height: 36,
  padding: "0 14px",
  cursor: "pointer",
  fontSize: 12.5,
  whiteSpace: "nowrap",
  color: "var(--color-accent)",
  background: "transparent",
  border: "1px solid var(--color-accent)",
  borderRadius: "var(--radius-md)",
};

// 「新規事業者を追加」（ゼロから入力）と「依頼主を事業者に変換」（名前だけ
// 引き継いで残りを入力）の両方で使う、事業者情報＋オーナーのログイン情報の
// 入力欄一式。selfServe=true のとき（公開のセルフサインアップ /signup 用）は、
// 本人が申し込む前提に合わせて挙動を変える：
// - 電話番号・連絡用メールアドレスは出さない（後から会社情報タブで入力できる。
//   連絡用メールが空欄のままでもログインメールアドレスを代わりに使う）
// - URLの説明を分かりやすくし、実際のURLをその場でプレビューする
// - パスワードは本人が決める前提でマスク表示にし、「自動生成」ボタンは出さない
//   （自動生成は「本部が代わりに作って本人に伝える」内部ツール専用の機能のため）
export function OrgAccountFields({
  form,
  set,
  showOwnerLogin = true,
  selfServe = false,
}: {
  form: OrgAccountFormState;
  set: <K extends keyof OrgAccountFormState>(key: K, value: string) => void;
  // false のとき: 「今ログイン中の自分にそのまま追加する」フロー用。新しい
  // ログイン情報を作らないので、オーナーのログイン欄自体を出さない。
  showOwnerLogin?: boolean;
  selfServe?: boolean;
}) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Field label="正式名称" value={form.name} onChange={(v) => set("name", v)} required />
        <Field label="表示名（依頼主に見える）" value={form.display_name} onChange={(v) => set("display_name", v)} required />
        <Field label="代表者名" value={form.rep_name} onChange={(v) => set("rep_name", v)} />
        {!selfServe && (
          <>
            <Field label="電話番号" value={form.tel} onChange={(v) => set("tel", v)} />
            <Field label="連絡用メールアドレス" value={form.email} onChange={(v) => set("email", v)} />
          </>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={label}>{selfServe ? "お問い合わせページのURL（半角英数字とハイフン）" : "URLの合言葉（半角英数字とハイフン）"}</span>
          <input required value={form.slug} onChange={(e) => set("slug", sanitizeSlugInput(e.target.value))} className="vid-input" style={input} />
          {selfServe && (
            <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>
              {form.slug ? `→ port.s-stylegolf.com/${form.slug}` : "依頼主がお問い合わせに使うURLになります"}
            </span>
          )}
        </div>
      </div>

      {showOwnerLogin && (
        <>
          <div style={{ fontSize: 12, color: "var(--color-neutral-500)", paddingTop: 6, borderTop: "1px solid var(--color-divider)" }}>
            {selfServe ? "受付画面に入るためのログイン情報" : "この事業者のオーナーが受付画面に入るためのログイン情報"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {/* オーナーの表示名が空欄なら代表者名→表示名の順で自動的に使われるため、
                セルフサインアップでは項目自体を出さず、内部ツールだけに残す。 */}
            {!selfServe && <Field label="オーナーの表示名" value={form.owner_display_name} onChange={(v) => set("owner_display_name", v)} />}
            <Field label="ログインメールアドレス" value={form.owner_email} onChange={(v) => set("owner_email", v)} type="email" required />
            {selfServe ? (
              <Field label="パスワード（8文字以上）" value={form.owner_password} onChange={(v) => set("owner_password", v)} type="password" required />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={label}>初期パスワード</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <input required value={form.owner_password} onChange={(e) => set("owner_password", e.target.value)} className="vid-input" style={input} />
                  <button type="button" onClick={() => set("owner_password", randomPassword())} style={{ ...smallBtn, flex: "none" }}>
                    自動生成
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

function Field({
  label: l,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={label}>{l}</span>
      <input type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} className="vid-input" style={input} />
    </div>
  );
}
