"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { sendInternalMessage, markThreadRead } from "@/app/actions";
import { headingWeight } from "@/lib/style";
import TextComposer from "@/components/TextComposer";
import type { AppRole } from "@/lib/supabase/types";

export interface HqThreadRow {
  customerId: string;
  customerName: string;
  threadId: string;
  unread: boolean;
  lastMessagePreview: string | null;
}

interface HqMessage {
  id: string;
  sender_id: string | null;
  sender_role: AppRole | null;
  kind: string;
  body: string | null;
  sent_at: string;
  deleted_at: string | null;
}

// 依頼主から本部への直接のご意見・ご要望（担当マネージャーには見えない）。
// 本部メンバー（owner）専用。スタッフ⇄本部の内部チャット（StaffThreadPane）
// と見た目・操作感を揃えている。
export default function HqMessagesChat({ currentUserId, orgId, rows: initialRows }: { currentUserId: string; orgId: string; rows: HqThreadRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from a server-refetched prop (router.refresh()), not state derived from other client state
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    const supabase = createClient(orgId);
    const channel = supabase
      .channel(`hq-list-${orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "threads" }, () => router.refresh())
      .subscribe();
    const interval = setInterval(() => router.refresh(), 4000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [orgId, router]);

  const selected = selectedId ? rows.find((r) => r.customerId === selectedId) : null;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0, maxWidth: 900, width: "100%", margin: "0 auto" }}>
      {!selected && (
        <div style={{ flex: "none", padding: "var(--space-6) var(--space-6) 0" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>ご意見・ご要望</div>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: !selected ? "var(--space-4) var(--space-6) var(--space-6)" : 0 }}>
        {selected ? (
          <HqThreadPane
            key={selected.threadId}
            threadId={selected.threadId}
            title={selected.customerName}
            currentUserId={currentUserId}
            orgId={orgId}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.length === 0 && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>まだやり取りがありません。</div>}
            {rows.map((r) => (
              <button
                key={r.customerId}
                onClick={() => setSelectedId(r.customerId)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  textAlign: "left",
                  cursor: "pointer",
                  padding: "12px 14px",
                  color: "var(--color-text)",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-divider)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: r.unread ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.customerName}</div>
                  {r.unread && (
                    <span style={{ flex: "none", fontSize: 10, fontWeight: 700, color: "var(--color-bg)", background: "var(--color-accent-200)", borderRadius: "var(--radius-sm)", padding: "1.5px 6px" }}>
                      未読
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-neutral-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.lastMessagePreview}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HqThreadPane({
  threadId,
  title,
  currentUserId,
  orgId,
  onBack,
}: {
  threadId: string;
  title: string;
  currentUserId: string;
  orgId: string;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<HqMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient(orgId);
    const { data } = await supabase
      .from("messages")
      .select("id, sender_id, sender_role, kind, body, sent_at, deleted_at")
      .eq("thread_id", threadId)
      .order("sent_at", { ascending: true });
    if (data) setMessages(data);
  }, [threadId, orgId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching from the server when the selected thread changes, not state derived from props/state
    void refresh();
    void markThreadRead(threadId);
  }, [threadId, refresh]);

  useEffect(() => {
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--color-divider)" }}>
        <button onClick={onBack} aria-label="一覧に戻る" style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-400)", background: "transparent", border: "none" }}>
          <ArrowLeft size={17} />
        </button>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 16 }}>{title}</div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "var(--space-4)" }}>
        {error && <div style={{ fontSize: 12.5, color: "var(--color-accent-200)" }}>{error}</div>}
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
              <span style={{ fontSize: 10, color: "var(--color-neutral-600)" }}>
                {m.sender_role === "client" ? "依頼主" : "本部"}・
                {new Date(m.sent_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          );
        })}
      </div>

      <TextComposer value={draft} onChange={setDraft} onSend={send} sending={sending} placeholder="メッセージを入力…" />
    </div>
  );
}
