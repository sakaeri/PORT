"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, PaperPlaneTilt, Trash } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { ensureStaffThread, sendInternalMessage, deleteMessage, markThreadRead } from "@/app/actions";
import { errorMessage } from "@/lib/errors";
import { headingWeight } from "@/lib/style";
import type { AppRole } from "@/lib/supabase/types";

interface InternalMessage {
  id: string;
  sender_id: string | null;
  sender_role: AppRole | null;
  kind: string;
  body: string | null;
  sent_at: string;
  deleted_at: string | null;
  senderName: string | null;
}

export default function StaffThreadPane({
  staffProfileId,
  title,
  currentUserId,
  orgId,
  onBack,
}: {
  staffProfileId: string;
  title: string;
  currentUserId: string;
  orgId: string;
  onBack?: () => void;
}) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(
    async (id: string) => {
      const supabase = createClient(orgId);
      const { data } = await supabase
        .from("messages")
        .select("id, sender_id, sender_role, kind, body, sent_at, deleted_at, profiles!messages_sender_id_fkey(display_name)")
        .eq("thread_id", id)
        .order("sent_at", { ascending: true });
      if (data) {
        setMessages(
          data.map((m) => {
            const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
            return { ...m, senderName: profile?.display_name ?? null };
          }),
        );
      }
    },
    [orgId],
  );

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting the pane when the selected staff member changes, not state derived from props/state
    setThreadId(null);
    setMessages([]);
    setError("");
    (async () => {
      try {
        const id = await ensureStaffThread(staffProfileId);
        if (cancelled) return;
        setThreadId(id);
        await refresh(id);
        await markThreadRead(id);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e, "読み込みに失敗しました"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [staffProfileId, refresh]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (!threadId) return;
    const supabase = createClient(orgId);
    const channel = supabase
      .channel(`staff-thread-${threadId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` }, () => refresh(threadId))
      .subscribe();
    const interval = setInterval(() => refresh(threadId), 4000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [threadId, orgId, refresh]);

  async function send() {
    if (sending || !draft.trim() || !threadId) return;
    setSending(true);
    const body = draft.trim();
    try {
      await sendInternalMessage(threadId, body);
      setMessages((m) => [
        ...m,
        { id: `temp-${Date.now()}`, sender_id: currentUserId, sender_role: null, kind: "text", body, sent_at: new Date().toISOString(), deleted_at: null, senderName: null },
      ]);
      setDraft("");
    } catch (e) {
      setError(errorMessage(e, "送信できませんでした"));
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(m: InternalMessage) {
    if (busy) return;
    if (!confirm("このメッセージを削除します。よろしいですか？")) return;
    setBusy(true);
    try {
      await deleteMessage(m.id);
      setMessages((rows) => rows.map((r) => (r.id === m.id ? { ...r, deleted_at: new Date().toISOString() } : r)));
    } catch (e) {
      setError(errorMessage(e, "削除できませんでした"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "var(--space-4)", borderBottom: "1px solid var(--color-divider)" }}>
        {onBack && (
          <button onClick={onBack} aria-label="一覧に戻る" style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-400)", background: "transparent", border: "none" }}>
            <ArrowLeft size={17} />
          </button>
        )}
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 16 }}>{title}</div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "var(--space-4)" }}>
        {error && <div style={{ fontSize: 12.5, color: "var(--color-accent-200)" }}>{error}</div>}
        {threadId && messages.length === 0 && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>まだやり取りがありません。</div>}
        {messages.map((m) => {
          const isOwn = m.sender_id === currentUserId;
          return (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: isOwn ? "flex-end" : "flex-start" }}>
              {m.deleted_at ? (
                <div style={{ fontSize: 12, fontStyle: "italic", color: "var(--color-neutral-500)" }}>削除されました</div>
              ) : (
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    fontSize: 13.5,
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

      <div style={{ flex: "none", display: "flex", gap: 8, padding: "var(--space-4)", borderTop: "1px solid var(--color-divider)" }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          placeholder="メッセージを入力…"
          className="vid-input"
          style={{
            flex: 1,
            minWidth: 0,
            height: 38,
            padding: "0 12px",
            font: "inherit",
            fontSize: 13.5,
            color: "var(--color-text)",
            background: "var(--color-bg)",
            border: "1px solid var(--color-divider)",
            borderRadius: "var(--radius-md)",
            outline: "none",
          }}
        />
        <button
          onClick={send}
          disabled={sending || !draft.trim() || !threadId}
          aria-label="送信"
          style={{ flex: "none", width: 38, height: 38, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}
        >
          <PaperPlaneTilt size={15} />
        </button>
      </div>
    </div>
  );
}
