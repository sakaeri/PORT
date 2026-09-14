"use client";

import { useState } from "react";
import { Trash } from "@phosphor-icons/react";
import { addWorkMemo, deleteWorkMemo } from "@/app/actions";

export interface WorkMemo {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export default function WorkMemos({ customerId, currentUserId, initialMemos }: { customerId: string; currentUserId: string; initialMemos: WorkMemo[] }) {
  const [memos, setMemos] = useState(initialMemos);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy || !draft.trim()) return;
    setBusy(true);
    try {
      const body = draft.trim();
      await addWorkMemo(customerId, body);
      setMemos((m) => [{ id: `temp-${Date.now()}`, authorId: currentUserId, authorName: "自分", body, createdAt: new Date().toISOString() }, ...m]);
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy) return;
    if (!confirm("このメモを削除しますか？")) return;
    setBusy(true);
    try {
      await deleteWorkMemo(id);
      setMemos((m) => m.filter((x) => x.id !== id));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--color-neutral-400)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
      >
        社内メモ{memos.length > 0 ? `（${memos.length}件）` : "（記録なし）"}
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)" }}>
          <div style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>依頼主には一切表示されません（スタッフ間の共有メモ）</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="メモを追加…"
              className="vid-input"
              style={{ flex: 1, minWidth: 0, height: 32, padding: "0 9px", font: "inherit", fontSize: 12.5, color: "var(--color-text)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-sm)", outline: "none" }}
            />
            <button onClick={submit} disabled={busy || !draft.trim()} style={{ flex: "none", height: 32, padding: "0 12px", fontSize: 12, cursor: "pointer", color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-sm)" }}>
              追加
            </button>
          </div>
          {memos.length === 0 && <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>まだメモがありません。</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
            {memos.map((m) => (
              <div key={m.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, lineHeight: 1.5 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span>{m.body}</span>
                  <div style={{ fontSize: 10, color: "var(--color-neutral-600)" }}>
                    {m.authorName}・{new Date(m.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                {m.authorId === currentUserId && (
                  <button onClick={() => remove(m.id)} disabled={busy} aria-label="削除" style={{ flex: "none", display: "flex", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}>
                    <Trash size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
