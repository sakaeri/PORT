"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/errors";
import { X, CheckCircle, Sun, MoonStars } from "@phosphor-icons/react";
import { updateCustomerName, changeEmail, startBalanceCharge, startAutoRechargeSetup, disableAutoRecharge } from "@/app/actions";
import { headingWeight } from "@/lib/style";
import LoginPanel from "@/components/chat/LoginPanel";
import AccountCreatePanel from "@/components/chat/AccountCreatePanel";
import AvatarPicker from "@/components/chat/AvatarPicker";
import HqChatPanel from "@/components/chat/HqChatPanel";
import SignOutButton from "@/components/chat/SignOutButton";
import ChargeCheckoutDialog from "@/components/chat/ChargeCheckoutDialog";

function ToggleSwitch({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      style={{
        flex: "none",
        width: 36,
        height: 20,
        padding: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: on ? "flex-end" : "flex-start",
        cursor: disabled ? "wait" : "pointer",
        background: on ? "var(--color-accent)" : "var(--color-divider)",
        border: "none",
        borderRadius: 999,
        opacity: disabled ? 0.6 : 1,
        transition: "justify-content 0.15s, background 0.15s",
      }}
    >
      <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff" }} />
    </button>
  );
}

const scrim: React.CSSProperties = { position: "fixed", inset: 0, background: "var(--stb-scrim)", zIndex: 60 };
const dialogBox: React.CSSProperties = {
  width: "min(440px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 20,
  borderRadius: "var(--radius-lg)",
  background: "var(--color-surface)",
  boxShadow: "var(--shadow-lg)",
};
const rowBox: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10 };
const smallBtn: React.CSSProperties = { flex: "none", height: 36, padding: "0 12px", cursor: "pointer", fontSize: 11.5, whiteSpace: "nowrap", color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" };
const input: React.CSSProperties = { width: "100%", height: 36, padding: "6px 10px", fontSize: 13.5, color: "var(--color-text)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none" };

const NAME_PLACEHOLDER = "未登録の依頼主";

function authTabBtn(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    height: 36,
    cursor: "pointer",
    fontSize: 12.5,
    color: active ? "var(--color-accent-100)" : "var(--color-accent)",
    background: active ? "var(--color-accent-900)" : "transparent",
    border: "1px solid var(--color-accent)",
    borderRadius: "var(--radius-md)",
  };
}

export default function MyPageDialog({
  userId,
  memberNo,
  customerName,
  currentEmail,
  hasGuestActivity,
  isAnonymous,
  avatarUrl,
  onAvatarChange,
  isDark,
  onToggleTheme,
  onClose,
  balance,
  autoRecharge,
}: {
  userId: string;
  memberNo: string | null;
  customerName: string;
  currentEmail: string | null;
  hasGuestActivity: boolean;
  isAnonymous: boolean;
  avatarUrl: string | null;
  onAvatarChange: (url: string | null) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onClose: () => void;
  balance: number;
  autoRecharge: { enabled: boolean; threshold: number | null; amount: number | null; hasCard: boolean };
}) {
  const [name, setName] = useState(customerName);
  const nameIsPlaceholder = name === NAME_PLACEHOLDER;

  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(nameIsPlaceholder ? "" : customerName);
  const [nameError, setNameError] = useState("");
  const [nameSaving, setNameSaving] = useState(false);

  const [email, setEmail] = useState(currentEmail ?? "");
  const [emOpen, setEmOpen] = useState(false);
  const [emNext, setEmNext] = useState("");
  const [emConf, setEmConf] = useState("");
  const [emError, setEmError] = useState("");
  const [emDone, setEmDone] = useState(false);
  const [emSaving, setEmSaving] = useState(false);

  const router = useRouter();
  const CHARGE_AMOUNTS = [10000, 30000, 50000, 100000];
  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeAmount, setChargeAmount] = useState(CHARGE_AMOUNTS[0]);
  const [chargeStarting, setChargeStarting] = useState(false);
  const [chargeError, setChargeError] = useState("");
  const [chargeClientSecret, setChargeClientSecret] = useState<string | null>(null);

  async function startCharge() {
    if (chargeStarting) return;
    setChargeStarting(true);
    setChargeError("");
    try {
      const clientSecret = await startBalanceCharge(chargeAmount);
      setChargeClientSecret(clientSecret);
    } catch (e) {
      setChargeError(errorMessage(e, "決済ページを開けませんでした"));
    } finally {
      setChargeStarting(false);
    }
  }

  function handleChargeComplete() {
    setChargeClientSecret(null);
    setChargeOpen(false);
    router.refresh();
  }

  const [arEnabledOverride, setArEnabledOverride] = useState<boolean | null>(null);
  const arEnabled = arEnabledOverride ?? autoRecharge.enabled;
  const [arOpen, setArOpen] = useState(false);
  const [arThreshold, setArThreshold] = useState(String(autoRecharge.threshold ?? 3000));
  const [arAmount, setArAmount] = useState(String(autoRecharge.amount ?? 10000));
  const [arStarting, setArStarting] = useState(false);
  const [arDisabling, setArDisabling] = useState(false);
  const [arError, setArError] = useState("");
  const [arClientSecret, setArClientSecret] = useState<string | null>(null);

  async function startAutoRecharge() {
    if (arStarting) return;
    const threshold = Number(arThreshold);
    const amount = Number(arAmount);
    if (!Number.isInteger(threshold) || threshold <= 0 || !Number.isInteger(amount) || amount < 1000) {
      setArError("金額を正しく入力してください（チャージ額は1,000円以上）");
      return;
    }
    setArStarting(true);
    setArError("");
    try {
      const clientSecret = await startAutoRechargeSetup(threshold, amount);
      setArClientSecret(clientSecret);
    } catch (e) {
      setArError(errorMessage(e, "設定ページを開けませんでした"));
    } finally {
      setArStarting(false);
    }
  }

  function handleAutoRechargeComplete() {
    setArClientSecret(null);
    setArOpen(false);
    setArEnabledOverride(true);
    router.refresh();
  }

  async function turnOffAutoRecharge() {
    if (arDisabling) return;
    setArDisabling(true);
    try {
      await disableAutoRecharge();
      setArEnabledOverride(false);
    } catch (e) {
      setArError(errorMessage(e, "操作に失敗しました"));
    } finally {
      setArDisabling(false);
    }
  }

  const [authView, setAuthView] = useState<"none" | "login" | "create">("none");

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) return setNameError("お名前をご入力ください");
    setNameSaving(true);
    setNameError("");
    try {
      await updateCustomerName(trimmed);
      setName(trimmed);
      setNameEditing(false);
    } catch (e) {
      setNameError(errorMessage(e, "保存できませんでした"));
    } finally {
      setNameSaving(false);
    }
  }

  async function saveEmail() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emNext)) return setEmError("メールアドレスの形式をご確認ください");
    if (emNext !== emConf) return setEmError("確認用のメールアドレスが一致しません");
    if (emNext === email) return setEmError("現在と同じアドレスです");
    setEmSaving(true);
    try {
      await changeEmail(emNext);
      setEmail(emNext);
      setEmOpen(false);
      setEmError("");
      setEmDone(true);
    } catch (e) {
      setEmError(errorMessage(e, "保存できませんでした"));
    } finally {
      setEmSaving(false);
    }
  }

  return (
    <>
    <div style={{ ...scrim, display: "grid", placeItems: "center", padding: "var(--space-4)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={dialogBox}>
          <button onClick={onClose} aria-label="閉じる" style={{ position: "absolute", top: 14, right: 14, width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}>
            <X size={16} />
          </button>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 20 }}>マイページ</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {isAnonymous && (
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ flex: 1, fontSize: 11.5, color: "var(--color-neutral-500)" }}>お問い合わせ番号</span>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 14 }}>{memberNo ?? "—"}</span>
              </div>
            )}

            {isAnonymous ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setAuthView((v) => (v === "login" ? "none" : "login"))} style={authTabBtn(authView === "login")}>
                    ログイン
                  </button>
                  <button onClick={() => setAuthView((v) => (v === "create" ? "none" : "create"))} style={authTabBtn(authView === "create")}>
                    アカウント作成
                  </button>
                </div>
                {authView === "login" && (
                  <LoginPanel hasGuestActivity={hasGuestActivity} forceOpen onRequestClose={() => setAuthView("none")} />
                )}
                {authView === "create" && <AccountCreatePanel onRequestClose={() => setAuthView("none")} />}
              </div>
            ) : (
              <>
                {/* プロフィール画像＋お名前（いつでも自由に変更可） */}
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <AvatarPicker userId={userId} customerName={customerName} avatarUrl={avatarUrl} onChange={onAvatarChange} />
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 7 }}>
                    {nameEditing || nameIsPlaceholder ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <input value={nameDraft} placeholder="山田 太郎" onChange={(e) => setNameDraft(e.target.value)} className="vid-input" style={{ ...input, flex: 1 }} />
                        <button onClick={saveName} disabled={nameSaving || !nameDraft.trim()} style={smallBtn}>
                          {nameSaving ? "保存中…" : "保存"}
                        </button>
                      </div>
                    ) : (
                      <div style={rowBox}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                        <button
                          onClick={() => {
                            setNameDraft(name);
                            setNameError("");
                            setNameEditing(true);
                          }}
                          style={{ ...smallBtn, color: "var(--color-neutral-300)", borderColor: "var(--color-divider)" }}
                        >
                          変更
                        </button>
                      </div>
                    )}
                    {nameError && <span style={{ fontSize: 11, color: "var(--color-accent-200)" }}>{nameError}</span>}
                  </div>
                </div>

                {/* メールアドレス */}
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <div style={rowBox}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email || "未登録"}</span>
                    <button onClick={() => setEmOpen((v) => !v)} style={smallBtn}>
                      {email ? "変更" : "登録"}
                    </button>
                  </div>
                  {emOpen && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: 12, borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-accent-800)" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>新しいメールアドレス</span>
                        <input type="email" value={emNext} onChange={(e) => setEmNext(e.target.value)} placeholder="例）yamada.taro@example.jp" className="vid-input" style={input} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>確認のため再入力</span>
                        <input type="email" value={emConf} onChange={(e) => setEmConf(e.target.value)} className="vid-input" style={input} />
                      </div>
                      {emError && <span style={{ fontSize: 11, color: "var(--color-accent-200)" }}>{emError}</span>}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={saveEmail} disabled={emSaving} style={{ flex: 1, height: 36, cursor: "pointer", fontSize: 12.5, color: "var(--color-accent-100)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}>
                          変更を保存
                        </button>
                        <button onClick={() => setEmOpen(false)} style={{ flex: "none", height: 36, padding: "0 14px", cursor: "pointer", fontSize: 12.5, color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
                          キャンセル
                        </button>
                      </div>
                      <span style={{ fontSize: 10.5, color: "var(--color-neutral-600)", lineHeight: 1.6 }}>保存すると新しいアドレスに確認メールをお送りします。</span>
                    </div>
                  )}
                  {emDone && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--color-accent-300)" }}>
                      <CheckCircle size={13} />
                      変更しました。確認メールをお送りしました
                    </span>
                  )}
                </div>
              </>
            )}

            {/* 画面の色合い */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, fontSize: 13.5 }}>画面の色合い</span>
              <button
                onClick={onToggleTheme}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", cursor: "pointer", fontSize: 11.5, whiteSpace: "nowrap", color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}
              >
                {isDark ? <Sun size={14} /> : <MoonStars size={14} />}
                {isDark ? "ライトに切替" : "ダークに切替"}
              </button>
            </div>

            {/* チャージ残高・自動チャージ（1つの細いブロックにまとめる） */}
            <div style={{ display: "flex", flexDirection: "column", borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px" }}>
                <span style={{ flex: 1, fontSize: 11.5, color: "var(--color-neutral-500)" }}>残高</span>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 15 }}>¥{balance.toLocaleString("ja-JP")}</span>
                {!chargeOpen && (
                  <button onClick={() => setChargeOpen(true)} style={{ flex: "none", height: 26, padding: "0 10px", cursor: "pointer", fontSize: 11, whiteSpace: "nowrap", color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}>
                    チャージ
                  </button>
                )}
              </div>
              {chargeOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "0 12px 10px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {CHARGE_AMOUNTS.map((a) => (
                      <button
                        key={a}
                        onClick={() => setChargeAmount(a)}
                        style={{
                          height: 27,
                          padding: "0 10px",
                          cursor: "pointer",
                          fontSize: 11.5,
                          color: chargeAmount === a ? "var(--color-accent-100)" : "var(--color-accent)",
                          background: chargeAmount === a ? "var(--color-accent-900)" : "transparent",
                          border: "1px solid var(--color-accent)",
                          borderRadius: "var(--radius-md)",
                        }}
                      >
                        ¥{a.toLocaleString("ja-JP")}
                      </button>
                    ))}
                  </div>
                  {chargeError && <span style={{ fontSize: 11, color: "var(--color-accent-200)" }}>{chargeError}</span>}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setChargeOpen(false)} style={{ height: 28, padding: "0 10px", cursor: "pointer", fontSize: 11, color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
                      閉じる
                    </button>
                    <button onClick={startCharge} disabled={chargeStarting} style={{ height: 28, padding: "0 12px", cursor: "pointer", fontSize: 11, color: "var(--color-accent-100)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)", opacity: chargeStarting ? 0.6 : 1 }}>
                      {chargeStarting ? "処理中…" : `¥${chargeAmount.toLocaleString("ja-JP")}をチャージ`}
                    </button>
                  </div>
                </div>
              )}

              <div style={{ height: 1, background: "var(--color-divider)" }} />

              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px" }}>
                <span style={{ flex: 1, fontSize: 11.5, color: "var(--color-neutral-500)" }}>自動チャージ</span>
                <ToggleSwitch on={arEnabled} disabled={arDisabling} onToggle={() => (arEnabled ? turnOffAutoRecharge() : setArOpen(true))} />
                {arEnabled && !arOpen && (
                  <button onClick={() => setArOpen(true)} style={{ flex: "none", height: 26, padding: "0 10px", cursor: "pointer", fontSize: 11, whiteSpace: "nowrap", color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}>
                    変更
                  </button>
                )}
              </div>
              {arEnabled && !arOpen && (
                <div style={{ fontSize: 10.5, color: "var(--color-neutral-600)", lineHeight: 1.5, padding: "0 12px 10px" }}>
                  残高が¥{(autoRecharge.threshold ?? 0).toLocaleString("ja-JP")}未満で¥{(autoRecharge.amount ?? 0).toLocaleString("ja-JP")}自動チャージ
                </div>
              )}
              {arOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "0 12px 10px" }}>
                  <div style={{ fontSize: 10.5, color: "var(--color-neutral-600)", lineHeight: 1.5 }}>
                    設定するとカード確認の画面に進みます。保存したカードへ、残高が下回った時に自動で課金することに同意したものとして扱われます。
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, fontSize: 10.5, color: "var(--color-neutral-500)" }}>
                      いくら未満で
                      <input value={arThreshold} onChange={(e) => setArThreshold(e.target.value)} type="number" min={1} style={{ ...input, height: 30 }} />
                    </label>
                    <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, fontSize: 10.5, color: "var(--color-neutral-500)" }}>
                      いくらチャージ
                      <input value={arAmount} onChange={(e) => setArAmount(e.target.value)} type="number" min={1000} style={{ ...input, height: 30 }} />
                    </label>
                  </div>
                  {arError && <span style={{ fontSize: 11, color: "var(--color-accent-200)" }}>{arError}</span>}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setArOpen(false)} style={{ height: 28, padding: "0 10px", cursor: "pointer", fontSize: 11, color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
                      閉じる
                    </button>
                    <button onClick={startAutoRecharge} disabled={arStarting} style={{ height: 28, padding: "0 12px", cursor: "pointer", fontSize: 11, color: "var(--color-accent-100)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)", opacity: arStarting ? 0.6 : 1 }}>
                      {arStarting ? "処理中…" : "カードを確認して設定する"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 担当マネージャーには見えない、本部との直接のやり取り */}
            <HqChatPanel />

            <div>
              <SignOutButton onSignedOut={onClose} />
            </div>
          </div>
        </div>
      </div>
      {chargeClientSecret && (
        <ChargeCheckoutDialog clientSecret={chargeClientSecret} onClose={() => setChargeClientSecret(null)} onComplete={handleChargeComplete} />
      )}
      {arClientSecret && (
        <ChargeCheckoutDialog clientSecret={arClientSecret} title="カードの登録" onClose={() => setArClientSecret(null)} onComplete={handleAutoRechargeComplete} />
      )}
    </>
  );
}
