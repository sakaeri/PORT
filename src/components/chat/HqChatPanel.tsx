"use client";

import { useEffect, useRef, useState } from "react";
import { ChatCircleDots } from "@phosphor-icons/react";
import { errorMessage } from "@/lib/errors";
import { getHqThread, sendHqMessage } from "@/app/actions";

interface HqMessage {
  id: string;
  senderRole: string | null;
  body: string;
  sentAt: string;
}

const bubbleBase: React.CSSProperties = {
  maxWidth: "85%",
  padding: "7px 11px",
  borderRadius: "var(--radius-md)",
  fontSize: 12.5,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
};

// 担当マネージャーには見えない、本部との直接のやり取り。マイページから
// 開閉できる簡易チャット（「ご意見・ご要望」の作り直し）。
export default function HqChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<HqMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    try {
      const result = await getHqThread();
      setMessages(result.messages);
    } catch {
      /* 次のポーリングで再試行する */
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching from the server on open, not state derived from props/state
    void refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError("");
    try {
      await sendHqMessage(trimmed);
      setDraft("");
      await refresh();
    } catch (e) {
      setError(errorMessage(e, "送信できませんでした"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ paddingTop: 12, borderTop: "1px solid var(--color-divider)" }}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--color-neutral-400)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
        >
          <ChatCircleDots size={15} />
          ご意見・ご要望はこちら
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--color-neutral-500)", flex: 1 }}>担当者には共有されず、運営に直接届きます</span>
            <button onClick={() => setOpen(false)} style={{ fontSize: 11, color: "var(--color-neutral-400)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
              閉じる
            </button>
          </div>

          <div
            ref={scrollRef}
            style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto", padding: messages.length ? "6px 0" : 0 }}
          >
            {loaded && messages.length === 0 && <span style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>まだやり取りがありません</span>}
            {messages.map((m) => {
              const isOwn = m.senderRole === "client";
              return (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: isOwn ? "flex-end" : "flex-start" }}>
                  <div
                    style={{
                      ...bubbleBase,
                      background: isOwn ? "var(--color-bubble-self-bg)" : "var(--color-bubble-other-bg)",
                      color: isOwn ? "var(--color-bubble-self-text)" : "var(--color-bubble-other-text)",
                      border: isOwn ? "none" : "1px solid var(--color-divider)",
                    }}
                  >
                    {m.body}
                  </div>
                </div>
              );
            })}
          </div>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className="vid-textarea"
            style={{ width: "100%", resize: "vertical", padding: "8px 10px", font: "inherit", fontSize: 13.5, color: "var(--color-text)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none" }}
          />
          {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={send}
              disabled={sending || !draft.trim()}
              style={{ height: 32, padding: "0 14px", cursor: "pointer", fontSize: 12, color: "var(--color-accent-100)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)", opacity: sending ? 0.6 : 1 }}
            >
              {sending ? "送信中…" : "送信"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
