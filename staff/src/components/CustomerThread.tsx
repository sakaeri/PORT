"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Archive, ArrowCounterClockwise, Trash, Eye, EyeSlash, PaperPlaneTilt, Paperclip } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { sendStaffMessage, hideMessage, unhideMessage, deleteMessage, archiveThread, unarchiveThread, deleteThread } from "@/app/actions";

export interface ThreadAttachment {
  id: string;
  file_name: string;
  mime: string | null;
  bytes: number | null;
}

export interface ThreadMessage {
  id: string;
  sender_role: "owner" | "reception" | "creator" | "client" | null;
  kind: string;
  body: string | null;
  payload: unknown;
  sent_at: string;
  hidden_at: string | null;
  attachments: ThreadAttachment[];
}

type Message = ThreadMessage;

const smallBtn: React.CSSProperties = {
  height: 30,
  padding: "0 10px",
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  cursor: "pointer",
  fontSize: 11.5,
  whiteSpace: "nowrap",
  color: "var(--color-neutral-400)",
  background: "transparent",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
};

function summarize(m: Message): string {
  const p = m.payload as { title?: string; menuLabel?: string; total?: number; summary?: string };
  switch (m.kind) {
    case "text":
      return m.body ?? "";
    case "files":
      return m.attachments.length ? `［添付ファイル］${m.attachments.map((a) => a.file_name).join("・")}` : "［添付ファイル］";
    case "quote":
      return `［見積もり］${p.title ?? ""}${p.total != null ? ` ¥${Number(p.total).toLocaleString("ja-JP")}` : ""}`;
    case "menu_pick":
      return `［メニュー選択］${p.menuLabel ?? ""}`;
    case "report":
      return `［完了報告］${p.summary ?? ""}`;
    case "rating":
      return "［評価］";
    case "notice":
      return `［お知らせ］${m.body ?? ""}`;
    case "off_choice":
      return `［選択］${m.body ?? ""}`;
    case "intake_request":
      return `［確認事項］${m.body ?? ""}`;
    case "system":
      return m.body ?? "［システム］";
    default:
      return m.body ?? `［${m.kind}］`;
  }
}

export default function CustomerThread({
  customer,
  thread,
  initialMessages,
  role,
}: {
  customer: { id: string; name: string; memberNo: string | null };
  thread: { id: string; archived: boolean } | null;
  initialMessages: Message[];
  role: "owner" | "reception";
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [archived, setArchived] = useState(thread?.archived ?? false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);

  async function send() {
    if (!thread || sending || !draft.trim()) return;
    setSending(true);
    const body = draft.trim();
    try {
      await sendStaffMessage(thread.id, body);
      setMessages((m) => [
        ...m,
        { id: `temp-${Date.now()}`, sender_role: role, kind: "text", body, payload: {}, sent_at: new Date().toISOString(), hidden_at: null, attachments: [] },
      ]);
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  async function toggleHide(m: Message) {
    if (busy) return;
    setBusy(true);
    try {
      if (m.hidden_at) {
        await unhideMessage(m.id);
        setMessages((rows) => rows.map((r) => (r.id === m.id ? { ...r, hidden_at: null } : r)));
      } else {
        await hideMessage(m.id);
        setMessages((rows) => rows.map((r) => (r.id === m.id ? { ...r, hidden_at: new Date().toISOString() } : r)));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteMessage(m: Message) {
    if (busy) return;
    if (!confirm("このメッセージを完全に削除します。元に戻せません。よろしいですか？")) return;
    setBusy(true);
    try {
      await deleteMessage(m.id);
      setMessages((rows) => rows.filter((r) => r.id !== m.id));
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive() {
    if (!thread || busy) return;
    setBusy(true);
    try {
      if (archived) await unarchiveThread(thread.id);
      else await archiveThread(thread.id);
      setArchived(!archived);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteThread() {
    if (!thread || busy) return;
    if (!confirm(`「${customer.name}」とのトーク履歴を完全に削除します。元に戻せません。よろしいですか？`)) return;
    setBusy(true);
    try {
      await deleteThread(thread.id);
      setGone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid var(--color-divider)" }}>
        <Link href="/customers" aria-label="依頼主一覧に戻る" style={{ display: "flex", color: "var(--color-neutral-400)" }}>
          <ArrowLeft size={17} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{customer.name}</div>
          <div style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{customer.memberNo ?? "—"}</div>
        </div>
        {thread && !gone && (
          <>
            <button onClick={toggleArchive} disabled={busy} style={smallBtn}>
              {archived ? <ArrowCounterClockwise size={13} /> : <Archive size={13} />}
              {archived ? "一覧に戻す" : "アーカイブ"}
            </button>
            <button onClick={handleDeleteThread} disabled={busy} style={{ ...smallBtn, color: "var(--color-accent-200)" }}>
              <Trash size={13} />
              トークを削除
            </button>
          </>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        {gone && <div style={{ fontSize: 13, color: "var(--color-neutral-500)" }}>このトークは削除されました。</div>}
        {!gone && !thread && <div style={{ fontSize: 13, color: "var(--color-neutral-500)" }}>まだやり取りがありません。</div>}
        {!gone &&
          messages.map((m) => {
            const isStaff = m.sender_role === "owner" || m.sender_role === "reception";
            return (
              <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: isStaff ? "flex-end" : "flex-start" }}>
                <div
                  style={{
                    maxWidth: "70%",
                    padding: "9px 13px",
                    borderRadius: "var(--radius-lg)",
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    opacity: m.hidden_at ? 0.45 : 1,
                    background: isStaff ? "var(--color-accent-900)" : "var(--color-surface)",
                    border: isStaff ? "1px solid var(--color-accent-800)" : "1px solid var(--color-divider)",
                  }}
                >
                  {summarize(m)}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, color: "var(--color-neutral-600)" }}>
                    {new Date(m.sent_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {m.hidden_at ? "・非表示中" : ""}
                  </span>
                  <button onClick={() => toggleHide(m)} disabled={busy} aria-label={m.hidden_at ? "表示に戻す" : "非表示にする"} style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}>
                    {m.hidden_at ? <Eye size={13} /> : <EyeSlash size={13} />}
                  </button>
                  <button onClick={() => handleDeleteMessage(m)} disabled={busy} aria-label="削除" style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}>
                    <Trash size={13} />
                  </button>
                </div>
              </div>
            );
          })}
      </div>

      {thread && !gone && (
        <div style={{ flex: "none", display: "flex", gap: 8, padding: "14px 20px", borderTop: "1px solid var(--color-divider)" }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="返信を入力…"
            className="vid-input"
            style={{
              flex: 1,
              minWidth: 0,
              resize: "none",
              maxHeight: 120,
              padding: "9px 12px",
              font: "inherit",
              fontSize: 13.5,
              color: "var(--color-text)",
              background: "var(--color-surface)",
              border: "1px solid var(--color-divider)",
              borderRadius: "var(--radius-md)",
              outline: "none",
            }}
          />
          <button onClick={send} disabled={sending || !draft.trim()} aria-label="送信" style={{ flex: "none", width: 40, height: 40, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}>
            <PaperPlaneTilt size={16} />
          </button>
        </div>
      )}
      {thread && !gone && (
        <div style={{ flex: "none", padding: "0 20px 12px", fontSize: 10.5, color: "var(--color-neutral-600)", display: "flex", alignItems: "center", gap: 5 }}>
          <Paperclip size={11} />
          ファイルの添付・見積もり等の送信は次のフェーズで対応します。
        </div>
      )}
    </div>
  );
}
