"use client";

import { useState } from "react";
import { Headset } from "@phosphor-icons/react";
import { errorMessage } from "@/lib/errors";
import { headingWeight } from "@/lib/style";
import { setInitialProfile, requestMagicLink } from "@/app/actions";

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

function tabBtn(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    height: 38,
    cursor: "pointer",
    fontSize: 12.5,
    color: active ? "var(--color-accent-100)" : "var(--color-accent)",
    background: active ? "var(--color-accent-900)" : "transparent",
    border: "1px solid var(--color-accent)",
    borderRadius: "var(--radius-md)",
  };
}

// 事業の方針で、ログイン（メールアドレスの確認）なしでは使えないようにした
// ゲート画面。VerifyGate（見えないCAPTCHA＋匿名セッション開始）の直後に、
// この画面を必ず経由させる。匿名セッション自体は今まで通り裏で作られて
// いるが、名前・メールアドレスを登録して確認メールのリンクを開くまでは
// チャット画面を見せない（page.tsx 側で ctx.isAnonymous を見て出し分ける）。
export default function AccountGate({ orgDisplayName }: { orgDisplayName: string }) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");

  async function submitNew() {
    if (!name.trim() || !email.trim()) {
      setError("お名前とメールアドレスをご入力ください");
      return;
    }
    if (!agreed) {
      setError("利用規約への同意が必要です");
      return;
    }
    setSending(true);
    setError("");
    try {
      await setInitialProfile(name, email, "", agreed);
      setSentTo(email);
    } catch (e) {
      setError(errorMessage(e, "作成できませんでした"));
    } finally {
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
      await requestMagicLink(email);
      setSentTo(email);
    } catch (e) {
      setError(errorMessage(e, "送信できませんでした"));
    } finally {
      setSending(false);
    }
  }

  return (
    <main
      style={{
        height: "100vh",
        display: "grid",
        placeItems: "center",
        background: "radial-gradient(circle at 50% 0%, var(--color-section-glow) 0%, var(--color-bg) 62%)",
        color: "var(--color-text)",
        fontFamily: "var(--font-body)",
        padding: 24,
      }}
    >
      <div style={{ width: "min(380px, 100%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 56,
            height: 56,
            display: "grid",
            placeItems: "center",
            borderRadius: "50%",
            background: "var(--color-accent-900)",
            border: "1px solid var(--color-accent-700)",
            marginBottom: 4,
          }}
        >
          <Headset size={26} color="var(--color-accent)" />
        </div>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 21, textAlign: "center" }}>{orgDisplayName}</div>
        <div style={{ fontSize: 13, lineHeight: 1.7, textAlign: "center", color: "var(--color-neutral-400)", marginBottom: 10 }}>
          ちょっとした頼みごとも、まずはこちらから。
          <br />
          あなたの人間秘書です。
        </div>

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
              <div style={{ fontSize: 13.5, lineHeight: 1.7, textAlign: "center", opacity: 0.85 }}>
                {sentTo} 宛にメールをお送りしました。メール内のリンクを開くとご利用いただけます。
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12.5, lineHeight: 1.7, textAlign: "center", opacity: 0.75 }}>ご利用にはメールアドレスの確認が必要です。</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setMode("new")} style={tabBtn(mode === "new")}>
                    はじめてご利用の方
                  </button>
                  <button onClick={() => setMode("existing")} style={tabBtn(mode === "existing")}>
                    ご利用いただいたことがある方
                  </button>
                </div>
                {mode === "new" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="お名前" className="vid-input" style={input} />
                    <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="メールアドレス" className="vid-input" style={input} />
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 11.5, lineHeight: 1.6, color: "var(--color-neutral-400)", cursor: "pointer" }}>
                      <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 2 }} />
                      <span>
                        <a href="/terms" target="_blank" rel="noreferrer" style={{ color: "var(--color-accent)" }}>
                          利用規約
                        </a>
                        に同意する
                      </span>
                    </label>
                    {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
                    <button
                      onClick={submitNew}
                      disabled={sending || !agreed}
                      style={{ height: 40, cursor: sending || !agreed ? "not-allowed" : "pointer", fontSize: 13.5, color: "var(--color-accent-100)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)", opacity: sending || !agreed ? 0.6 : 1 }}
                    >
                      {sending ? "送信中…" : "はじめる"}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="登録済みのメールアドレス" className="vid-input" style={input} />
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
      </div>
    </main>
  );
}
