"use client";

import { useState } from "react";
import { X, CheckCircle, Gift, CaretDown, CaretRight, ChatsCircle, Receipt, UsersThree, Sun, MoonStars } from "@phosphor-icons/react";
import type { VaultRow } from "@/lib/chat-types";
import { saveVaultItem, deleteVaultItem, setInitialName, changeEmail, requestNameChange } from "@/app/actions";
import { headingWeight } from "@/lib/style";
import LoginPanel from "@/components/chat/LoginPanel";

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
const fieldLabel: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--color-neutral-500)" };
const rowBox: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-divider)" };
const smallBtn: React.CSSProperties = { flex: "none", height: 30, padding: "0 12px", cursor: "pointer", fontSize: 11.5, whiteSpace: "nowrap", color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" };
const input: React.CSSProperties = { width: "100%", height: 36, padding: "6px 10px", fontSize: 13.5, color: "var(--color-text)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none" };

const NAME_PLACEHOLDER = "未登録の依頼主";
const NAME_REASONS = ["入力の誤り", "改姓・改名", "社名・屋号の変更"];

export default function MyPageDialog({
  memberNo,
  customerName,
  currentEmail,
  vault,
  hasGuestActivity,
  isDark,
  onToggleTheme,
  onClose,
}: {
  memberNo: string | null;
  customerName: string;
  currentEmail: string | null;
  vault: VaultRow[];
  hasGuestActivity: boolean;
  isDark: boolean;
  onToggleTheme: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(customerName);
  const nameIsPlaceholder = name === NAME_PLACEHOLDER;

  const [nameOpen, setNameOpen] = useState(false);
  const [nameNext, setNameNext] = useState("");
  const [nameReason, setNameReason] = useState<string | null>(null);
  const [nameError, setNameError] = useState("");
  const [namePending, setNamePending] = useState(false);
  const [nameSelfSaving, setNameSelfSaving] = useState(false);

  const [email, setEmail] = useState(currentEmail ?? "");
  const [emOpen, setEmOpen] = useState(false);
  const [emNext, setEmNext] = useState("");
  const [emConf, setEmConf] = useState("");
  const [emError, setEmError] = useState("");
  const [emDone, setEmDone] = useState(false);
  const [emSaving, setEmSaving] = useState(false);

  const [vaultRows, setVaultRows] = useState(vault.map((v) => ({ ...v })));

  const [refOpen, setRefOpen] = useState(false);
  const [refStarted, setRefStarted] = useState(false);

  async function saveSelfName() {
    if (!name.trim() || nameSelfSaving) return;
    setNameSelfSaving(true);
    try {
      await setInitialName(name.trim());
    } catch {
      // 既に登録済みだった場合はそのまま「変更を依頼」フローに切り替える
    } finally {
      setNameSelfSaving(false);
    }
  }

  async function sendNameChangeRequest() {
    const next = nameNext.trim();
    if (!next) return setNameError("新しいお名前を入力してください");
    if (next === name) return setNameError("現在と同じお名前です");
    if (!nameReason) return setNameError("変更の理由をお選びください");
    setNamePending(true);
    try {
      await requestNameChange(next, nameReason);
      setNameOpen(false);
      setNameError("");
    } catch (e) {
      setNameError(e instanceof Error ? e.message : "送信できませんでした");
    } finally {
      setNamePending(false);
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
      setEmError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setEmSaving(false);
    }
  }

  function updateVaultLocal(id: string, patch: Partial<VaultRow>) {
    setVaultRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function commitVault(id: string) {
    const row = vaultRows.find((r) => r.id === id);
    if (!row || (!row.label.trim() && !row.value.trim())) return;
    const savedId = await saveVaultItem(id, row.label, row.value);
    if (savedId !== id) {
      setVaultRows((rows) => rows.map((r) => (r.id === id ? { ...r, id: savedId } : r)));
    }
  }

  async function addVaultRow() {
    const tempId = `temp-${Date.now()}`;
    setVaultRows((rows) => [...rows, { id: tempId, customer_id: "", label: "", value: "", sort: rows.length, updated_at: new Date().toISOString() }]);
  }

  async function removeVaultRow(id: string) {
    setVaultRows((rows) => rows.filter((r) => r.id !== id));
    await deleteVaultItem(id);
  }

  return (
    <div style={{ ...scrim, display: "grid", placeItems: "center", padding: "var(--space-4)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={dialogBox}>
          <button onClick={onClose} aria-label="閉じる" style={{ position: "absolute", top: 14, right: 14, width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}>
            <X size={16} />
          </button>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 20 }}>マイページ</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-divider)" }}>
              <span style={{ flex: 1, fontSize: 11.5, color: "var(--color-neutral-500)" }}>会員番号</span>
              <span style={{ fontFamily: "var(--font-heading)", fontSize: 14 }}>{memberNo ?? "—"}</span>
            </div>

            <LoginPanel hasGuestActivity={hasGuestActivity} />

            {/* 画面の色合い */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-divider)" }}>
              <span style={{ flex: 1, fontSize: 13.5 }}>画面の色合い</span>
              <button
                onClick={onToggleTheme}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px", cursor: "pointer", fontSize: 11.5, whiteSpace: "nowrap", color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}
              >
                {isDark ? <Sun size={14} /> : <MoonStars size={14} />}
                {isDark ? "ライトに切替" : "ダークに切替"}
              </button>
            </div>

            {/* お名前 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <label style={fieldLabel}>お名前</label>
              {nameIsPlaceholder ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={name === NAME_PLACEHOLDER ? "" : name} placeholder="山田 太郎" onChange={(e) => setName(e.target.value)} className="vid-input" style={{ ...input, flex: 1 }} />
                  <button onClick={saveSelfName} disabled={nameSelfSaving || !name.trim()} style={smallBtn}>
                    保存
                  </button>
                </div>
              ) : (
                <div style={rowBox}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                  <button onClick={() => setNameOpen((v) => !v)} style={{ ...smallBtn, color: "var(--color-neutral-300)", borderColor: "var(--color-divider)" }}>
                    変更を依頼
                  </button>
                </div>
              )}
              <span style={{ fontSize: 10.5, color: "var(--color-neutral-600)", lineHeight: 1.6 }}>契約書・見積書・請求書の宛名に使うため、受付が確認して変更します</span>
              {nameOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: 12, borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-accent-800)" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>新しいお名前</span>
                    <input value={nameNext} onChange={(e) => setNameNext(e.target.value)} placeholder="例）山田 太郎" className="vid-input" style={input} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>変更の理由</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {NAME_REASONS.map((r) => (
                        <button
                          key={r}
                          onClick={() => {
                            setNameReason(r);
                            setNameError("");
                          }}
                          style={{
                            height: 29,
                            padding: "0 11px",
                            cursor: "pointer",
                            fontSize: 11.5,
                            whiteSpace: "nowrap",
                            color: nameReason === r ? "var(--color-accent-100)" : "var(--color-neutral-400)",
                            background: nameReason === r ? "var(--color-accent-900)" : "transparent",
                            border: `1px solid ${nameReason === r ? "var(--color-accent)" : "var(--color-divider)"}`,
                            borderRadius: 20,
                          }}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                  {nameError && <span style={{ fontSize: 11, color: "var(--color-accent-200)" }}>{nameError}</span>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={sendNameChangeRequest} disabled={namePending} style={{ flex: 1, height: 36, cursor: "pointer", fontSize: 12.5, color: "var(--color-accent-100)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}>
                      受付に変更を依頼
                    </button>
                    <button onClick={() => setNameOpen(false)} style={{ flex: "none", height: 36, padding: "0 14px", cursor: "pointer", fontSize: 12.5, color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
                      キャンセル
                    </button>
                  </div>
                  <span style={{ fontSize: 10.5, color: "var(--color-neutral-600)", lineHeight: 1.6 }}>発行済みの書類は差し替えが必要な場合があります。受付が確認のうえご連絡します。</span>
                </div>
              )}
            </div>

            {/* メールアドレス */}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <label style={fieldLabel}>メールアドレス</label>
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
                  <span style={{ fontSize: 10.5, color: "var(--color-neutral-600)", lineHeight: 1.6 }}>保存すると新しいアドレスに確認メールをお送りします。受付や担当者への通知は行われません。</span>
                </div>
              )}
              {emDone && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--color-accent-300)" }}>
                  <CheckCircle size={13} />
                  変更しました。確認メールをお送りしました
                </span>
              )}
            </div>

            {/* よく使う情報（vault） */}
            <div style={{ display: "flex", flexDirection: "column", gap: 9, paddingTop: 12, borderTop: "1px solid var(--color-divider)" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <div style={{ flex: 1, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-accent)" }}>よく使う情報</div>
                <button onClick={addVaultRow} style={{ flex: "none", height: 26, padding: "0 10px", cursor: "pointer", fontSize: 11, whiteSpace: "nowrap", color: "var(--color-neutral-300)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
                  ＋ 項目を追加
                </button>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--color-neutral-600)", lineHeight: 1.6 }}>素材の置き場所や公開先など、毎回お伝えいただかずに済むものを登録できます。</div>
              {vaultRows.map((v) => (
                <div key={v.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    value={v.label}
                    onChange={(e) => updateVaultLocal(v.id, { label: e.target.value })}
                    onBlur={() => commitVault(v.id)}
                    placeholder="項目名"
                    className="vid-input"
                    style={{ flex: "none", width: 132, height: 32, padding: "5px 9px", fontSize: 12, color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none" }}
                  />
                  <input
                    value={v.value}
                    onChange={(e) => updateVaultLocal(v.id, { value: e.target.value })}
                    onBlur={() => commitVault(v.id)}
                    placeholder="未登録"
                    className="vid-input"
                    style={{ minWidth: 0, flex: 1, height: 32, padding: "5px 9px", fontSize: 12.5, color: "var(--color-text)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none" }}
                  />
                  <button
                    onClick={() => removeVaultRow(v.id)}
                    aria-label="削除"
                    style={{ flex: "none", width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* PORT referral block */}
            <div style={{ paddingTop: 12, borderTop: "1px solid var(--color-divider)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: 12, borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-divider)" }}>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 14, lineHeight: 1.5 }}>この窓口のしくみを、自社でも</div>
                <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.65 }}>
                  この画面は PORT という受付のしくみです。同じやり方で、自社の依頼受付にもお使いいただけます。月額 ¥4,800 ＋ 制作者1人あたり ¥1,500〜。
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--color-accent-200)" }}>
                  <Gift size={14} />
                  <span>
                    {refStarted
                      ? "ご案内をメールでお送りしました。紹介経由のため、基本料が3ヶ月無料になります。"
                      : "紹介経由なので、基本料が3ヶ月無料になります。"}
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <button onClick={() => setRefStarted(true)} style={{ height: 34, padding: "0 14px", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap", color: "var(--color-accent-100)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}>
                    3ヶ月無料で始める
                  </button>
                  <button onClick={() => setRefOpen((v) => !v)} style={{ height: 34, padding: "0 12px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, whiteSpace: "nowrap", color: "var(--color-neutral-400)", background: "transparent", border: "none" }}>
                    {refOpen ? <CaretDown size={13} /> : <CaretRight size={13} />}
                    できること
                  </button>
                </div>
                {refOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 9, borderTop: "1px solid var(--color-divider)" }}>
                    {[
                      { icon: <ChatsCircle size={13} />, text: "依頼はトーク1本。フォームも管理表も作らずに受け付けられます" },
                      { icon: <Receipt size={13} />, text: "見積・決済・完了報告・領収書までこの画面の中で完結します" },
                      { icon: <UsersThree size={13} />, text: "外注先や社内スタッフへの割り振りと報酬の集計まで含まれます" },
                    ].map((p, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11.5, color: "var(--color-neutral-400)", lineHeight: 1.6 }}>
                        <span style={{ flex: "none", marginTop: 2, color: "var(--color-accent)" }}>{p.icon}</span>
                        <span>{p.text}</span>
                      </div>
                    ))}
                    <div style={{ fontSize: 10.5, color: "var(--color-neutral-600)", lineHeight: 1.6, marginTop: 2 }}>
                      基本料 ¥4,800 が3ヶ月無料になります。制作者の席は1人目（ご本人）が基本料に含まれ、2人目から ¥1,500/月です。
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
