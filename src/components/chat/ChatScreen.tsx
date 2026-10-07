"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/chat/Header";
import Composer from "@/components/chat/Composer";
import { TextBubble, FilesBubble, NoticeBubble, MenuPickBubble, RequestCard, IntakeCard, IntakeAnswerBubble } from "@/components/chat/Bubbles";
import { ProgressPanel, CancelDialog, ReportsDialog } from "@/components/chat/Dialogs";
import MyPageDialog from "@/components/chat/MyPageDialog";
import { createClient } from "@/lib/supabase/client";
import { MESSAGE_PAGE_SIZE, mapMessageRow, type CustomerContext, type MessageWithExtras, type RawMessageRow, type RequestBundle } from "@/lib/chat-types";
import {
  sendMessage as sendMessageAction,
  declineQuote,
  submitRating,
  skipRating,
  payFromBalance,
} from "@/app/actions";

interface Props {
  ctx: CustomerContext;
  initialMessages: MessageWithExtras[];
  initialHasMoreOlder?: boolean;
}

const ACKED_KEY = "VID_acked_reports";

function readAcked(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(ACKED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function writeAcked(ids: Set<string>) {
  try {
    localStorage.setItem(ACKED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

export default function ChatScreen({ ctx, initialMessages, initialHasMoreOlder }: Props) {
  const [messages, setMessages] = useState(initialMessages);
  const [oldestLoadedAt, setOldestLoadedAt] = useState<string | null>(initialMessages[0]?.sent_at ?? null);
  const [hasMoreOlder, setHasMoreOlder] = useState(!!initialHasMoreOlder);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const skipAutoScrollRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showProgress, setShowProgress] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showMyPage, setShowMyPage] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Both start matching the server's render (empty set / dark) and sync from
  // localStorage/the DOM in an effect (client-only, after hydration) — an
  // inline script in layout.tsx already applies the persisted theme to <html>
  // before hydration, so reading it in the initializer here would make the
  // client's first render diverge from what the server actually sent
  // whenever the visitor had light mode (or acked reports) already saved,
  // producing a hydration mismatch.
  const [ackedIds, setAckedIds] = useState<Set<string>>(() => new Set());
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from localStorage/the DOM (set outside React), not state derived from props/state
    setAckedIds(readAcked());
    setIsDark(document.documentElement.getAttribute("data-vid-theme") !== "light");
  }, []);
  const [avatarUrl, setAvatarUrl] = useState(ctx.avatarUrl);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 4秒おきのポーリングやリアルタイム通知のたびに messages の参照が更新され、
  // 内容が同じでも useEffect が走ってしまう。過去ログを読もうとスクロールを
  // 上げている最中に毎回最下部へ戻されるのを防ぐため、「下端付近にいる時だけ
  // 自動スクロールする」ようにする。
  const isNearBottomRef = useRef(true);

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
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    if (!isNearBottomRef.current) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const MESSAGE_SELECT = "*, message_attachments(*), profiles!messages_sender_id_fkey(display_name, avatar_url), requests(*, request_items(*), completion_reports(*), completion_report_attachments(*), ratings(*))";

  // 開いている間に届いた新着分だけを取りに行く（既に読み込んだ最古の時点以降のみ）。
  // 会話全体を毎回取り直すと、やり取りが長い依頼主ほどポーリングのたびに重くなるため。
  const refresh = useCallback(async () => {
    const supabase = createClient(ctx.orgId);
    const { data, error } = oldestLoadedAt
      ? await supabase.from("messages").select(MESSAGE_SELECT).eq("thread_id", ctx.threadId).is("deleted_at", null).gte("sent_at", oldestLoadedAt).order("sent_at", { ascending: true })
      : await supabase.from("messages").select(MESSAGE_SELECT).eq("thread_id", ctx.threadId).is("deleted_at", null).order("sent_at", { ascending: false }).limit(MESSAGE_PAGE_SIZE);
    if (error) {
      console.error("ChatScreen refresh failed", error);
      return;
    }
    if (data) {
      const rows = (oldestLoadedAt ? data : data.slice().reverse()) as RawMessageRow[];
      setMessages(rows.map(mapMessageRow));
      if (!oldestLoadedAt && rows.length > 0) setOldestLoadedAt(rows[0].sent_at);
    }
  }, [ctx.threadId, ctx.orgId, oldestLoadedAt]);

  async function loadOlderMessages() {
    if (loadingOlder || !hasMoreOlder || !oldestLoadedAt) return;
    setLoadingOlder(true);
    try {
      const supabase = createClient(ctx.orgId);
      const { data, error } = await supabase
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("thread_id", ctx.threadId)
        .is("deleted_at", null)
        .lt("sent_at", oldestLoadedAt)
        .order("sent_at", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);
      if (error) console.error("ChatScreen loadOlderMessages failed", error);
      const rows = (data ?? []) as RawMessageRow[];
      if (rows.length > 0) {
        const older = rows.slice().reverse().map(mapMessageRow);
        const container = scrollRef.current;
        const prevScrollHeight = container?.scrollHeight ?? 0;
        skipAutoScrollRef.current = true;
        setMessages((prev) => [...older, ...prev]);
        setOldestLoadedAt(older[0].sent_at);
        requestAnimationFrame(() => {
          if (container) container.scrollTop = container.scrollHeight - prevScrollHeight;
        });
      }
      setHasMoreOlder(rows.length === MESSAGE_PAGE_SIZE);
    } finally {
      setLoadingOlder(false);
    }
  }

  useEffect(() => {
    const supabase = createClient(ctx.orgId);
    const channel = supabase
      .channel(`thread-${ctx.threadId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `thread_id=eq.${ctx.threadId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "requests", filter: `customer_id=eq.${ctx.customerId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "completion_reports" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "ratings", filter: `customer_id=eq.${ctx.customerId}` }, refresh)
      .subscribe();
    // WebSocket通知だけに頼らず、数秒おきのポーリングも保険として併用する
    // （接続直後の認証タイミング等でイベントを取りこぼしても、数秒以内に追いつく）。
    const interval = setInterval(refresh, 4000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [ctx.threadId, ctx.customerId, ctx.orgId, refresh]);

  function toggleTheme() {
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-vid-theme", next);
    try {
      localStorage.setItem("VID_theme", next);
    } catch {
      /* ignore */
    }
    setIsDark(!isDark);
  }

  const bundles = useMemo(
    () => messages.filter((m) => m.requestBundle).map((m) => m.requestBundle as RequestBundle),
    [messages],
  );
  const activeCount = bundles.filter((b) => b.request.phase === "quoted" || ["preparing", "started"].includes(b.request.phase)).length;
  const reportsCount = bundles.filter((b) => b.request.phase === "completed" && b.report?.sent_at && !ackedIds.has(b.request.id)).length;

  const q = searchQuery.trim().toLowerCase();
  const matches = (haystack: string) => !q || haystack.toLowerCase().includes(q);
  let matchCount = 0;
  const visible = messages.filter((m) => {
    if (!q) return true;
    let hay = m.body ?? "";
    if (m.requestBundle) hay += " " + m.requestBundle.request.title + " " + (m.requestBundle.report?.summary ?? "");
    if (m.attachments.length) hay += " " + m.attachments.map((a) => a.file_name).join(" ");
    const isMatch = matches(hay);
    if (isMatch) matchCount++;
    return isMatch;
  });

  async function handleSend(text: string) {
    await sendMessageAction(text);
    await refresh();
  }

  const cancelTargetBundle = cancelTargetId ? bundles.find((b) => b.request.id === cancelTargetId) ?? null : null;

  async function handleCancelConfirm() {
    if (!cancelTargetId || busy) return;
    setBusy(true);
    try {
      await declineQuote(cancelTargetId);
      await refresh();
      setCancelTargetId(null);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  function ackReport(id: string) {
    setAckedIds((prev) => {
      const next = new Set(prev).add(id);
      writeAcked(next);
      return next;
    });
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--color-bg)", fontFamily: "var(--font-body)", color: "var(--color-text)" }}>
      <Header
        brandName={ctx.orgDisplayName}
        activeCount={activeCount}
        reportsCount={reportsCount}
        searchQuery={searchQuery}
        searchResultCount={q ? matchCount : null}
        onSearchChange={setSearchQuery}
        onOpenProgress={() => setShowProgress(true)}
        onOpenReports={() => setShowReports(true)}
        onOpenMyPage={() => setShowMyPage(true)}
        isAnonymous={ctx.isAnonymous}
        customerName={ctx.customerName}
        avatarUrl={avatarUrl}
      />

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "var(--space-6) var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {hasMoreOlder && (
          <button
            onClick={loadOlderMessages}
            disabled={loadingOlder}
            style={{ alignSelf: "center", height: 30, padding: "0 14px", cursor: "pointer", fontSize: 12, color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
          >
            {loadingOlder ? "読み込み中…" : "過去のやり取りを読み込む"}
          </button>
        )}
        <div style={{ textAlign: "center", fontSize: 11, color: "var(--color-neutral-600)", letterSpacing: "0.04em" }}>今日</div>
        {visible.map((m) => {
          const highlight = !!q;
          switch (m.kind) {
            case "text":
              return <TextBubble key={m.id} msg={m} highlight={highlight} orgDisplayName={ctx.orgDisplayName} />;
            case "files":
              return <FilesBubble key={m.id} msg={m} highlight={highlight} orgId={ctx.orgId} orgDisplayName={ctx.orgDisplayName} />;
            case "notice":
            case "system":
              return <NoticeBubble key={m.id} msg={m} />;
            case "menu_pick":
              return <MenuPickBubble key={m.id} msg={m} />;
            case "intake_request":
              return <IntakeCard key={m.id} msg={m} />;
            case "intake_answer":
              return <IntakeAnswerBubble key={m.id} msg={m} />;
            case "quote":
              return m.requestBundle ? (
                <RequestCard
                  key={m.id}
                  msg={m}
                  bundle={m.requestBundle}
                  balance={ctx.balance}
                  orgId={ctx.orgId}
                  onPay={async (id) => {
                    await payFromBalance(id);
                    await refresh();
                  }}
                  onSubmitRating={async (id, stars, comment) => {
                    await submitRating(id, stars, comment);
                    await refresh();
                  }}
                  onSkipRating={async (id) => {
                    await skipRating(id);
                    await refresh();
                  }}
                />
              ) : null;
            default:
              return null;
          }
        })}
      </div>

      <Composer onSend={handleSend} />

      {showProgress && (
        <ProgressPanel
          bundles={bundles}
          onClose={() => setShowProgress(false)}
          onCancel={(id) => { setShowProgress(false); setCancelTargetId(id); }}
        />
      )}
      {showReports && <ReportsDialog bundles={bundles} ackedIds={ackedIds} onAck={ackReport} onClose={() => setShowReports(false)} />}
      {cancelTargetBundle && (
        <CancelDialog confirming={busy} onClose={() => setCancelTargetId(null)} onConfirm={handleCancelConfirm} />
      )}
      {showMyPage && (
        <MyPageDialog
          userId={ctx.userId}
          memberNo={ctx.memberNo}
          customerName={ctx.customerName}
          currentEmail={ctx.email}
          hasGuestActivity={messages.length > 0}
          isAnonymous={ctx.isAnonymous}
          avatarUrl={avatarUrl}
          onAvatarChange={setAvatarUrl}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          onClose={() => setShowMyPage(false)}
          balance={ctx.balance}
          autoRecharge={ctx.autoRecharge}
        />
      )}
    </div>
  );
}
