"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/chat/Header";
import Composer, { type PendingAttachment } from "@/components/chat/Composer";
import { TextBubble, FilesBubble, NoticeBubble, MenuPickBubble, RequestCard, IntakeCard, IntakeAnswerBubble } from "@/components/chat/Bubbles";
import { ProgressPanel, CancelDialog, ReportsDialog, MenuSheet } from "@/components/chat/Dialogs";
import MyPageDialog from "@/components/chat/MyPageDialog";
import { createClient } from "@/lib/supabase/client";
import { MESSAGE_PAGE_SIZE, mapMessageRow, type CustomerContext, type MenuRow, type MessageWithExtras, type RawMessageRow, type RequestBundle, type VaultRow } from "@/lib/chat-types";
import type { Database } from "@/lib/supabase/types";
import {
  sendMessage as sendMessageAction,
  submitMenuInquiry,
  cancelRequest,
  submitRating,
  skipRating,
} from "@/app/actions";

type RefundPolicyRow = Database["public"]["Tables"]["refund_policies"]["Row"];

interface Props {
  ctx: CustomerContext;
  initialMessages: MessageWithExtras[];
  initialHasMoreOlder?: boolean;
  menus: MenuRow[];
  refundPolicies: RefundPolicyRow[];
  initialVault: VaultRow[];
  companies: { org_id: string; display_name: string; domain: string | null; slug: string | null }[];
}

const MENU_SELECT = "*, menu_questions(*)";

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

export default function ChatScreen({ ctx, initialMessages, initialHasMoreOlder, menus: initialMenus, refundPolicies, initialVault, companies }: Props) {
  const [messages, setMessages] = useState(initialMessages);
  const [oldestLoadedAt, setOldestLoadedAt] = useState<string | null>(initialMessages[0]?.sent_at ?? null);
  const [hasMoreOlder, setHasMoreOlder] = useState(!!initialHasMoreOlder);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const skipAutoScrollRef = useRef(false);
  const [menus, setMenus] = useState(initialMenus);
  const vault = initialVault;
  const [searchQuery, setSearchQuery] = useState("");
  const [showProgress, setShowProgress] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showMyPage, setShowMyPage] = useState(false);
  const [showMenuSheet, setShowMenuSheet] = useState(false);
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

  useEffect(() => {
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const MESSAGE_SELECT = "*, message_attachments(*), requests(*, request_items(*), completion_reports(*), ratings(*))";

  // 開いている間に届いた新着分だけを取りに行く（既に読み込んだ最古の時点以降のみ）。
  // 会話全体を毎回取り直すと、やり取りが長い依頼主ほどポーリングのたびに重くなるため。
  const refresh = useCallback(async () => {
    const supabase = createClient(ctx.orgId);
    const { data } = oldestLoadedAt
      ? await supabase.from("messages").select(MESSAGE_SELECT).eq("thread_id", ctx.threadId).is("deleted_at", null).gte("sent_at", oldestLoadedAt).order("sent_at", { ascending: true })
      : await supabase.from("messages").select(MESSAGE_SELECT).eq("thread_id", ctx.threadId).is("deleted_at", null).order("sent_at", { ascending: false }).limit(MESSAGE_PAGE_SIZE);
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
      const { data } = await supabase
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("thread_id", ctx.threadId)
        .is("deleted_at", null)
        .lt("sent_at", oldestLoadedAt)
        .order("sent_at", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);
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

  // 受付側でメニューや「はじめの質問」を追加・編集しても、この画面をすでに開いている
  // 依頼主に反映されるようにする（開いたまま放置されがちな画面のため）。
  const refreshMenus = useCallback(async () => {
    const supabase = createClient(ctx.orgId);
    const { data } = await supabase
      .from("menus")
      .select(MENU_SELECT)
      .eq("org_id", ctx.orgId)
      .eq("active", true)
      .order("sort", { ascending: true });
    if (data) setMenus(data as MenuRow[]);
  }, [ctx.orgId]);

  useEffect(() => {
    const supabase = createClient(ctx.orgId);
    const channel = supabase
      .channel(`menus-${ctx.orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "menus", filter: `org_id=eq.${ctx.orgId}` }, refreshMenus)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_questions" }, refreshMenus)
      .subscribe();
    const interval = setInterval(refreshMenus, 4000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [ctx.orgId, refreshMenus]);

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

  async function handleSend(text: string, attachments: PendingAttachment[]) {
    await sendMessageAction(text, attachments);
    await refresh();
  }

  async function handleMenuSubmit(menu: MenuRow, rows: { label: string; value: string }[], note: string) {
    await submitMenuInquiry(menu.id, menu.label, menu.icon, rows, note);
    await refresh();
    setShowMenuSheet(false);
  }

  const cancelTargetBundle = cancelTargetId ? bundles.find((b) => b.request.id === cancelTargetId) ?? null : null;

  async function handleCancelConfirm() {
    if (!cancelTargetId || busy) return;
    setBusy(true);
    try {
      await cancelRequest(cancelTargetId);
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
              return <TextBubble key={m.id} msg={m} highlight={highlight} />;
            case "files":
              return <FilesBubble key={m.id} msg={m} highlight={highlight} orgId={ctx.orgId} />;
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
                  refundPolicies={refundPolicies}
                  onCancel={setCancelTargetId}
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

      <Composer threadId={ctx.threadId} orgId={ctx.orgId} onSend={handleSend} onOpenMenuSheet={() => setShowMenuSheet(true)} />

      {showProgress && (
        <ProgressPanel
          bundles={bundles}
          refundPolicies={refundPolicies}
          onClose={() => setShowProgress(false)}
          onCancel={(id) => { setShowProgress(false); setCancelTargetId(id); }}
        />
      )}
      {showReports && <ReportsDialog bundles={bundles} ackedIds={ackedIds} onAck={ackReport} onClose={() => setShowReports(false)} />}
      {showMenuSheet && <MenuSheet menus={menus} onClose={() => setShowMenuSheet(false)} onSubmit={handleMenuSubmit} />}
      {cancelTargetBundle && (
        <CancelDialog bundle={cancelTargetBundle} refundPolicies={refundPolicies} confirming={busy} onClose={() => setCancelTargetId(null)} onConfirm={handleCancelConfirm} />
      )}
      {showMyPage && (
        <MyPageDialog
          userId={ctx.userId}
          memberNo={ctx.memberNo}
          customerName={ctx.customerName}
          currentEmail={ctx.email}
          vault={vault}
          hasGuestActivity={messages.length > 0}
          isAnonymous={ctx.isAnonymous}
          avatarUrl={avatarUrl}
          onAvatarChange={setAvatarUrl}
          orgId={ctx.orgId}
          companies={companies}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          onClose={() => setShowMyPage(false)}
        />
      )}
    </div>
  );
}
