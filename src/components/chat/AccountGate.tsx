"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/errors";
import { headingWeight } from "@/lib/style";
import { submitFirstInquiry, requestMagicLink, verifyLoginCode } from "@/app/actions";
import { savePendingInquiry } from "@/lib/pending-inquiry";
import GateInfo from "@/components/chat/GateInfo";
import InfoTooltip from "@/components/chat/InfoTooltip";

const input: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "6px 12px",
  font: "inherit",
  fontSize: 14,
  color: "var(--color-text)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
  outline: "none",
};

const heading: React.CSSProperties = { fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 16, textAlign: "center" };

// 入口の画面。VerifyGate（見えないCAPTCHA＋匿名セッション開始）の直後に必ず経由する。
// 「登録」ではなく「まずは相談してみる」（窓口では「お問い合わせ」）のフォームにして、
// 身構えずに送れるようにしている。送るとその場でトークに届き、画面はトークに切り替わる
// （page.tsx が ctx.pendingEmail を見て出し分ける）。登録済みの人は「ログイン」から。
export default function AccountGate({ orgDisplayName, isDesk, initialError }: { orgDisplayName: string; isDesk?: boolean; initialError?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState(initialError ?? "");

  async function submitNew() {
    if (!name.trim() || !email.trim() || !body.trim()) {
      setError(isDesk ? "お名前・メールアドレス・お問い合わせ内容をご入力ください" : "お名前・メールアドレス・ご相談内容をご入力ください");
      return;
    }
    setSending(true);
    setError("");
    savePendingInquiry(body);
    try {
      const r = await submitFirstInquiry(name, email, body);
      if (r.error !== null) {
        setError(r.error || "送信できませんでした");
        setSending(false);
        return;
      }
      // ふつうはトークに切り替わる。登録済みのアドレスだった場合はログイン用のメールが
      // 届いているので、送信済みの画面のまま数字を入力できるようにしておく。
      setSentTo(email);
      setSending(false);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e, "送信できませんでした"));
      setSending(false);
    }
  }

  async function submitLogin() {
    if (!email.trim()) {
      setError("メールアドレスをご入力ください");
      return;
    }
    setSending(true);
    setError("");
    try {
      const r = await requestMagicLink(email);
      if (r.error !== null) return setError(r.error || "送信できませんでした");
      setSentTo(email);
    } catch (e) {
      setError(errorMessage(e, "送信できませんでした"));
    } finally {
      setSending(false);
    }
  }

  async function submitCode() {
    if (!code.trim()) return;
    setSending(true);
    setError("");
    try {
      const r = await verifyLoginCode(sentTo, code);
      if (r.error !== null) {
        setError(r.error || "ログインできませんでした");
        setSending(false);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(errorMessage(e, "ログインできませんでした"));
      setSending(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        justifyItems: "center",
        // 真ん中に置くと下の3ボタンの分だけ全体が下寄りに見えるので、少し上から始める
        alignContent: "start",
        paddingTop: "clamp(76px, calc(9vh + 44px), 140px)",
        background: "radial-gradient(circle at 50% 0%, var(--color-section-glow) 0%, var(--color-bg) 62%)",
        color: "var(--color-text)",
        fontFamily: "var(--font-body)",
        paddingLeft: 24,
        paddingRight: 24,
        paddingBottom: 24,
      }}
    >
      <div style={{ width: "min(380px, 100%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            overflow: "hidden",
            marginBottom: 4,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 固定サイズの静的アセットのため plain img */}
          <img src="/logo.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 21, textAlign: "center", marginBottom: isDesk ? 10 : 0 }}>{orgDisplayName}</div>
        {/* 秘書サービスの案内文なので、問い合わせ窓口では出さない。 */}
        {!isDesk && (
          <div style={{ fontSize: 13, lineHeight: 1.7, textAlign: "center", color: "var(--color-neutral-400)", marginBottom: 10 }}>
            ちょっとした頼みごとも、まずはこちらから。
            <br />
            単発から定期まで柔軟に対応いたします。
          </div>
        )}
        {!isDesk && <GateInfo />}

        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            padding: 22,
            borderRadius: "var(--radius-lg)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-divider)",
            boxShadow: "var(--shadow-md)",
          }}
        >
            {sentTo ? (
              <>
                <div style={{ fontSize: 13.5, lineHeight: 1.7, textAlign: "center", opacity: 0.85 }}>
                  {sentTo} にログイン用のメールをお送りしました。
                  <br />
                  メール内のボタンを押すか、確認コードを入力してください。
                </div>
                {/* ホーム画面に追加したアプリでは、リンクが別のブラウザで開いてしまうことがあるため数字でも入れる。 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitCode()}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="確認コード"
                    maxLength={10}
                    className="vid-input"
                    style={{ ...input, height: 44, fontSize: 18, letterSpacing: "0.2em", textAlign: "center" }}
                  />
                  {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
                  <button
                    onClick={submitCode}
                    disabled={sending || !code.trim()}
                    style={{ height: 40, cursor: "pointer", fontSize: 13.5, color: "var(--color-accent-100)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)", opacity: sending || !code.trim() ? 0.6 : 1 }}
                  >
                    {sending ? "確認中…" : "ログイン"}
                  </button>
                </div>
                {/* アドレスの打ち間違いや、メールが届かないときに入力画面へ戻れるように。
                    登録の無いアドレスでも同じ表示にしているので、届かないときの案内は ⓘ に入れる。 */}
                <div style={{ alignSelf: "center", display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  onClick={() => {
                    setSentTo("");
                    setCode("");
                    setError("");
                  }}
                  style={{ alignSelf: "center", padding: 4, cursor: "pointer", fontSize: 12, color: "var(--color-accent)", background: "transparent", border: "none", textDecoration: "underline" }}
                >
                  アドレスを直す・もう一度送る
                </button>
                <InfoTooltip
                  text={`メールが届かないときは、迷惑メールのフォルダもご確認ください。ご登録のないアドレスには届きません。はじめての方は「${isDesk ? "お問い合わせ" : "まずは相談してみる"}」からお送りください。確認コードは届いてから15分間有効です。`}
                />
                </div>
              </>
            ) : (
              <>
                <div style={heading}>{mode === "existing" ? "ログイン" : isDesk ? "お問い合わせ" : "まずは相談してみる"}</div>
                {mode === "new" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="お名前" className="vid-input" style={input} />
                    <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="メールアドレス" autoComplete="email" className="vid-input" style={input} />
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder={isDesk ? "お問い合わせ内容" : "ご相談内容（ざっくりで大丈夫です）"}
                      rows={4}
                      maxLength={4000}
                      className="vid-input"
                      style={{ ...input, height: "auto", minHeight: 96, padding: "10px 12px", lineHeight: 1.6, resize: "vertical" }}
                    />
                    {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
                    <button
                      onClick={submitNew}
                      disabled={sending}
                      style={{ height: 40, cursor: sending ? "wait" : "pointer", fontSize: 13.5, color: "var(--color-accent-100)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)", opacity: sending ? 0.6 : 1 }}
                    >
                      {sending ? "送信中…" : isDesk ? "送信する" : "相談する"}
                    </button>
                    <div style={{ fontSize: 11, lineHeight: 1.6, textAlign: "center", color: "var(--color-neutral-500)" }}>
                      送信すると
                      <a href="/terms" target="_blank" rel="noreferrer" style={{ color: "var(--color-accent)" }}>
                        利用規約
                      </a>
                      に同意したものとみなします。
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 12, lineHeight: 1.7, textAlign: "center", color: "var(--color-neutral-400)" }}>
                      メールに届くリンクからログインできます。
                      <span style={{ marginLeft: 4, verticalAlign: "middle", display: "inline-flex" }}>
                        <InfoTooltip text="パスワードは使いません。ご登録のメールアドレスに届くリンクを開くだけでログインできるので、パスワードが漏れたり使い回されたりする心配がありません。リンクは届いてから15分間有効です。" />
                      </span>
                    </div>
                    <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="登録済みのメールアドレス" autoComplete="email" className="vid-input" style={input} />
                    {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
                    <button
                      onClick={submitLogin}
                      disabled={sending}
                      style={{ height: 40, cursor: "pointer", fontSize: 13.5, color: "var(--color-accent-100)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)", opacity: sending ? 0.6 : 1 }}
                    >
                      {sending ? "送信中…" : "ログインリンクを送る"}
                    </button>
                  </div>
                )}
              </>
            )}
        </div>

        {/* 相談フォームとは別物に見えるよう、ログインはカードの外に置く。 */}
        {!sentTo && (
          <button
            onClick={() => {
              setMode(mode === "new" ? "existing" : "new");
              setError("");
            }}
            style={{ width: "100%", height: 40, marginTop: 4, cursor: "pointer", fontSize: 13, color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent-800)", borderRadius: "var(--radius-md)" }}
          >
            {mode === "new" ? "ご利用中の方はこちら（ログイン）" : isDesk ? "お問い合わせに戻る" : "相談フォームに戻る"}
          </button>
        )}
        {!isDesk && (
          <a href="/legal" target="_blank" rel="noreferrer" style={{ alignSelf: "center", fontSize: 11, color: "var(--color-neutral-500)" }}>
            特定商取引法に基づく表記
          </a>
        )}
      </div>
    </main>
  );
}
