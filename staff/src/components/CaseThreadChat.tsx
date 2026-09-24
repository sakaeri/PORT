"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PaperPlaneTilt, Trash } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { sendCaseMessage, deleteMessage, markThreadRead } from "@/app/actions";
import type { AppRole } from "@/lib/supabase/types";

export interface CaseMessage {
  id: string;
  sender_id: string | null;
  sender_role: AppRole | null;
  kind: string;
  body: string | null;
  sent_at: string;
  deleted_at: string | null;
  senderName: string | null;
}

export default function CaseThreadChat({
  threadId,
  orgId,
  currentUserId,
  initialMessages,
}: {
  threadId: string;
  orgId: string;
  currentUserId: string;
  initialMessages: CaseMessage[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    void markThreadRead(threadId);
  }, [threadId]);

  const refresh = useCallback(async () => {
    const supabase = createClient(orgId);
    const { data } = await supabase
      .from("messages")
      .select("id, sender_id, sender_role, kind, body, sent_at, deleted_at, profiles!messages_sender_id_fkey(display_name)")
      .eq("thread_id", threadId)
      .order("sent_at", { ascending: true });
    if (data) {
      setMessages(
        data.map((m) => {
          const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
          return { ...m, senderName: profile?.display_name ?? null };
        }),
      );
    }
  }, [threadId, orgId]);

  useEffect(() => {
    const supabase = createClient(orgId);
    const channel = supabase
      .channel(`case-thread-${threadId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` }, refresh)
      .subscribe();
    const interval = setInterval(refresh, 4000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [threadId, orgId, refresh]);

  async function send() {
    if (sending || !draft.trim()) return;
    setSending(true);
    const body = draft.trim();
    try {
      await sendCaseMessage(threadId, body);
      setMessages((m) => [
        ...m,
        { id: `temp-${Date.now()}`, sender_id: currentUserId, sender_role: null, kind: "text", body, sent_at: new Date().toISOString(), deleted_at: null, senderName: null },
      ]);
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(m: CaseMessage) {
    if (busy) return;
    if (!confirm("このメッセージを削除します。よろしいですか？")) return;
    setBusy(true);
    try {
      await deleteMessage(m.id);
      setMessages((rows) => rows.map((r) => (r.id === m.id ? { ...r, deleted_at: new Date().toISOString() } : r)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>案件トーク（スタッフ内・進捗ログ）</div>
      <div ref={scrollRef} style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto", padding: "4px 2px" }}>
        {messages.length === 0 && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>まだ記録がありません。</div>}
        {messages.map((m) => {
          if (m.kind === "notice") {
            return (
              <div key={m.id} style={{ textAlign: "center", fontSize: 11, color: "var(--color-neutral-500)" }}>
                {m.deleted_at ? "削除されました" : m.body}
              </div>
            );
          }
          const isOwn = m.sender_id === currentUserId;
          return (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: isOwn ? "flex-end" : "flex-start" }}>
              {m.deleted_at ? (
                <div style={{ fontSize: 12, fontStyle: "italic", color: "var(--color-neutral-500)" }}>削除されました</div>
              ) : (
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "7px 11px",
                    borderRadius: "var(--radius-md)",
                    fontSize: 13,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    background: isOwn ? "var(--color-bubble-self-bg)" : "var(--color-bubble-other-bg)",
                    color: isOwn ? "var(--color-bubble-self-text)" : "var(--color-bubble-other-text)",
                    border: isOwn ? "none" : "1px solid var(--color-divider)",
                  }}
                >
                  {m.body}
                </div>
              )}
              {!m.deleted_at && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: "var(--color-neutral-600)" }}>
                    {m.senderName ?? "スタッフ"}・
                    {new Date(m.sent_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {isOwn && (
                    <button onClick={() => handleDelete(m)} disabled={busy} aria-label="削除" style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}>
                      <Trash size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          placeholder="メモを入力…"
          className="vid-input"
          style={{
            flex: 1,
            minWidth: 0,
            height: 36,
            padding: "0 10px",
            font: "inherit",
            fontSize: 13,
            color: "var(--color-text)",
            background: "var(--color-bg)",
            border: "1px solid var(--color-divider)",
            borderRadius: "var(--radius-md)",
            outline: "none",
          }}
        />
        <button
          onClick={send}
          disabled={sending || !draft.trim()}
          aria-label="送信"
          style={{ flex: "none", width: 36, height: 36, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}
        >
          <PaperPlaneTilt size={14} />
        </button>
      </div>
    </div>
  );
}
