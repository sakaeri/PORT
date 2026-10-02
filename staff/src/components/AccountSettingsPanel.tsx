"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "@phosphor-icons/react";
import { updateMyDisplayName, updateOrgDisplayName, updateLoginEmail, updateLoginPassword } from "@/app/actions";
import { errorMessage } from "@/lib/errors";
import { headingWeight } from "@/lib/style";

const input: React.CSSProperties = {
  width: "100%",
  height: 38,
  padding: "0 12px",
  fontSize: 13.5,
  color: "var(--color-text)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
  outline: "none",
};
const fieldLabel: React.CSSProperties = { fontSize: 11.5, color: "var(--color-neutral-500)" };
const smallBtn: React.CSSProperties = {
  height: 32,
  flex: "none",
  padding: "0 12px",
  cursor: "pointer",
  fontSize: 12,
  whiteSpace: "nowrap",
  color: "var(--color-accent)",
  background: "transparent",
  border: "1px solid var(--color-accent)",
  borderRadius: "var(--radius-md)",
};
const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "11px 13px",
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-divider)",
};
const editBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 9,
  padding: 13,
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-accent-800)",
};

// 自分の表示名・ログイン用メール/パスワード・（オーナーなら）事業者の
// 表示名をまとめて変更するパネル。以前は「表示名変更」「会社情報」
// 「ログイン情報」に分かれていたものを一本化した。
export default function AccountSettingsPanel({
  currentName,
  orgDisplayName,
  loginEmail,
  isOwner,
  onNameSaved,
  onClose,
}: {
  currentName: string;
  orgDisplayName: string;
  loginEmail: string;
  isOwner: boolean;
  onNameSaved: (name: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [orgName, setOrgName] = useState(orgDisplayName);
  const [email, setEmail] = useState(loginEmail);
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingPw, setEditingPw] = useState(false);
  const [curPw, setCurPw] = useState("");
  const [nextPw, setNextPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function saveName() {
    const trimmed = name.trim();
    if (saving || !trimmed) return;
    setSaving("name");
    setError("");
    try {
      await updateMyDisplayName(trimmed);
      onNameSaved(trimmed);
    } catch (e) {
      setError(errorMessage(e, "変更できませんでした"));
    } finally {
      setSaving(null);
    }
  }

  async function saveOrgName() {
    const trimmed = orgName.trim();
    if (saving || !trimmed) return;
    setSaving("orgName");
    setError("");
    try {
      await updateOrgDisplayName(trimmed);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e, "変更できませんでした"));
    } finally {
      setSaving(null);
    }
  }

  async function saveEmail() {
    if (saving) return;
    setError("");
    if (!email.trim()) return setError("メールアドレスを入力してください");
    setSaving("email");
    try {
      await updateLoginEmail(email.trim());
      setEditingEmail(false);
      setDone("確認メールを新しいアドレスに送信しました。リンクを開くと切り替わります。");
    } catch (e) {
      setError(errorMessage(e, "変更できませんでした"));
    } finally {
      setSaving(null);
    }
  }

  async function savePassword() {
    if (saving) return;
    setError("");
    if (nextPw.length < 8) return setError("新しいパスワードは8文字以上にしてください");
    if (nextPw !== confirmPw) return setError("新しいパスワードが一致しません");
    setSaving("password");
    try {
      await updateLoginPassword(curPw, nextPw);
      setEditingPw(false);
      setCurPw("");
      setNextPw("");
      setConfirmPw("");
      setDone("パスワードを変更しました。");
    } catch (e) {
      setError(errorMessage(e, "変更できませんでした"));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 20 }}>アカウント設定</div>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} aria-label="閉じる" style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-400)", background: "transparent", border: "none" }}>
          <X size={18} />
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={fieldLabel}>表示名（社内で表示される呼び方）</span>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} className="vid-input" style={{ ...input, flex: 1 }} />
          <button onClick={saveName} disabled={saving === "name" || !name.trim()} style={smallBtn}>
            {saving === "name" ? "保存中…" : "保存"}
          </button>
        </div>
      </div>

      {isOwner && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={fieldLabel}>事業者の表示名（依頼主に見える名前）</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} className="vid-input" style={{ ...input, flex: 1 }} />
            <button onClick={saveOrgName} disabled={saving === "orgName" || !orgName.trim()} style={smallBtn}>
              {saving === "orgName" ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8, borderTop: "1px solid var(--color-divider)" }}>
        <div style={row}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={fieldLabel}>ログイン用メールアドレス</span>
            <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</span>
          </div>
          <button
            onClick={() => {
              setEditingEmail((v) => !v);
              setEditingPw(false);
              setError("");
              setDone("");
            }}
            style={smallBtn}
          >
            変更
          </button>
        </div>
        {editingEmail && (
          <div style={editBox}>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="vid-input" style={input} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveEmail} disabled={saving === "email"} style={{ ...smallBtn, height: 34 }}>
                {saving === "email" ? "保存中…" : "変更を保存"}
              </button>
              <button onClick={() => setEditingEmail(false)} style={{ ...smallBtn, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
                キャンセル
              </button>
            </div>
          </div>
        )}

        <div style={row}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={fieldLabel}>パスワード</span>
            <span style={{ fontSize: 13, letterSpacing: "0.12em" }}>••••••••</span>
          </div>
          <button
            onClick={() => {
              setEditingPw((v) => !v);
              setEditingEmail(false);
              setError("");
              setDone("");
            }}
            style={smallBtn}
          >
            変更
          </button>
        </div>
        {editingPw && (
          <div style={editBox}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} placeholder="現在のパスワード" className="vid-input" style={input} />
              <input type="password" value={nextPw} onChange={(e) => setNextPw(e.target.value)} placeholder="新しいパスワード（8文字以上）" className="vid-input" style={input} />
              <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="確認のため再入力" className="vid-input" style={input} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={savePassword} disabled={saving === "password"} style={{ ...smallBtn, height: 34 }}>
                {saving === "password" ? "保存中…" : "変更を保存"}
              </button>
              <button
                onClick={() => {
                  setEditingPw(false);
                  setCurPw("");
                  setNextPw("");
                  setConfirmPw("");
                }}
                style={{ ...smallBtn, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}
              >
                キャンセル
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
      {done && <span style={{ fontSize: 11.5, color: "var(--color-accent-300)" }}>{done}</span>}
    </div>
  );
}
