"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendInternalMessage, markThreadRead } from "@/app/actions";
import TextComposer from "@/components/TextComposer";
import Avatar, { avatarInitial } from "@/components/Avatar";
import type { AppRole } from "@/lib/supabase/types";

interface HqMessage {
  id: string;
  sender_id: string | null;
  sender_role: AppRole | null;
  kind: string;
  body: string | null;
  sent_at: string;
  deleted_at: string | null;
  avatarUrl?: string | null;
}

// 依頼主から本部への直接のご意見・ご要望（担当秘書には見えない）。
// 依頼主詳細画面の社内情報パネルに、本部メンバー（owner）にだけ埋め込む。
export default function HqFeedbackChat({ threadId, orgId, currentUserId }: { threadId: string; orgId: string; currentUserId: string }) {
  const [messages, setMessages] = useState<HqMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const refresh = useCallback(async () => {
    const supabase = createClient(orgId);
    const { data } = await supabase
      .from("messages")
      .select("id, sender_id, sender_role, kind, body, sent_at, deleted_at, profiles!messages_sender_id_fkey(avatar_url)")
      .eq("thread_id", threadId)
      .order("sent_at", { ascending: true });
    if (data) {
      setMessages(
        data.map((m) => {
          const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
          return { ...m, avatarUrl: profile?.avatar_url ?? null };
        }),
      );
    }
  }, [threadId, orgId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching from the server when this embedded thread is opened, not state derived from props/state
    void refresh();
    void markThreadRead(threadId);
  }, [threadId, refresh]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function handleScroll() {
      if (!el) return;
      isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    }
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!isNearBottomRef.current) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    const supabase = createClient(orgId);
    const channel = supabase
      .channel(`hq-thread-${threadId}`)
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
      await sendInternalMessage(threadId, body);
      setDraft("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信できませんでした");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 10.5, color: "var(--color-neutral-600)", lineHeight: 1.6 }}>
        依頼主から本部への直接のやり取りです（担当秘書には見えません）。
      </div>
      <div ref={scrollRef} style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {error && <div style={{ fontSize: 12, color: "var(--color-accent-200)" }}>{error}</div>}
        {messages.length === 0 && <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>まだやり取りがありません。</div>}
        {messages.map((m) => {
          const isOwn = m.sender_id === currentUserId;
          return (
            <div key={m.id} style={{ display: "flex", flexDirection: isOwn ? "row-reverse" : "row", gap: 6, alignItems: "flex-end", maxWidth: "88%", alignSelf: isOwn ? "flex-end" : "flex-start" }}>
              {!isOwn && <Avatar url={m.avatarUrl} initial={avatarInitial(m.sender_role === "client" ? "依頼主" : "本部")} size={22} />}
              <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: isOwn ? "flex-end" : "flex-start", minWidth: 0 }}>
              {m.deleted_at ? (
                <div style={{ fontSize: 11.5, fontStyle: "italic", color: "var(--color-neutral-500)" }}>削除されました</div>
              ) : (
                <div
                  style={{
                    maxWidth: "100%",
                    padding: "7px 10px",
                    borderRadius: "var(--radius-md)",
                    fontSize: 12.5,
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
              <span style={{ fontSize: 9.5, color: "var(--color-neutral-600)" }}>
                {m.sender_role === "client" ? "依頼主" : "本部"}・
                {new Date(m.sent_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
              </div>
            </div>
          );
        })}
      </div>
      <TextComposer value={draft} onChange={setDraft} onSend={send} sending={sending} placeholder="返信を入力…" />
    </div>
  );
}
