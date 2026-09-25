"use client";

import { useState } from "react";
import { updateMyDisplayName } from "@/app/actions";
import { errorMessage } from "@/lib/errors";
import { headingWeight } from "@/lib/style";

// 自分の表示名を変更するポップアップ。役職に関係なく誰でも使える
// （窓口管理などオーナー専用の設定とは別の、身の回りの小さな設定）。
export default function SelfNamePanel({ currentName, onSaved, onClose }: { currentName: string; onSaved: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const trimmed = name.trim();
    if (saving || !trimmed) return;
    setSaving(true);
    setError("");
    try {
      await updateMyDisplayName(trimmed);
      onSaved(trimmed);
      onClose();
    } catch (e) {
      setError(errorMessage(e, "変更できませんでした"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 20 }}>表示名を変更</div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="vid-input"
        style={{ height: 40, padding: "0 12px", fontSize: 13.5, color: "var(--color-text)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none" }}
      />
      {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
      <button
        onClick={save}
        disabled={saving || !name.trim()}
        style={{ alignSelf: "flex-start", height: 38, padding: "0 16px", cursor: "pointer", fontSize: 13, color: "var(--color-accent-100)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}
      >
        {saving ? "保存中…" : "保存"}
      </button>
    </div>
  );
}
