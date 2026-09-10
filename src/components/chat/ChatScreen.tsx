"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/chat/Header";
import Composer, { type PendingAttachment } from "@/components/chat/Composer";
import { TextBubble, FilesBubble, NoticeBubble, MenuPickBubble, RequestCard } from "@/components/chat/Bubbles";
import { ProgressPanel, PayDialog, CancelDialog, ReportsDialog, MenuSheet } from "@/components/chat/Dialogs";
import MyPageDialog from "@/components/chat/MyPageDialog";
import { createClient } from "@/lib/supabase/client";
import { mapMessageRow, type CustomerContext, type MenuRow, type MessageWithExtras, type RawMessageRow, type RequestBundle, type VaultRow } from "@/lib/chat-types";
import type { Database } from "@/lib/supabase/types";
import {
  sendMessage as sendMessageAction,
  submitMenuInquiry,
  payRequest,
  cancelRequest,
  submitRating,
  skipRating,
  setInitialProfile,
} from "@/app/actions";

type RefundPolicyRow = Database["public"]["Tables"]["refund_policies"]["Row"];

interface Props {
  ctx: CustomerContext;
  initialMessages: MessageWithExtras[];
  menus: MenuRow[];
  refundPolicies: RefundPolicyRow[];
  initialVault: VaultRow[];
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

export default function ChatScreen({ ctx, initialMessages, menus, refundPolicies, initialVault }: Props) {
  const [messages, setMessages] = useState(initialMessages);
  const [searchQuery, setSearchQuery] = useState("");
  const [showProgress, setShowProgress] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showMyPage, setShowMyPage] = useState(false);
  const [showMenuSheet, setShowMenuSheet] = useState(false);
  const [payTargetId, setPayTargetId] = useState<string | null>(null);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ackedIds, setAckedIds] = useState<Set<string>>(() => (typeof window === "undefined" ? new Set<string>() : readAcked()));
  const [isDark, setIsDark] = useState(() => typeof document === "undefined" ? true : document.documentElement.getAttribute("data-vid-theme") !== "light");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("messages")
      .select("*, message_attachments(*), requests(*, request_items(*), completion_reports(*), ratings(*))")
      .eq("thread_id", ctx.threadId)
      .order("sent_at", { ascending: true });
    if (data) setMessages((data as RawMessageRow[]).map(mapMessageRow));
  }, [ctx.threadId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`thread-${ctx.threadId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `thread_id=eq.${ctx.threadId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "requests", filter: `customer_id=eq.${ctx.customerId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "completion_reports" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "ratings", filter: `customer_id=eq.${ctx.customerId}` }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ctx.threadId, ctx.customerId, refresh]);

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
  const activeCount = bundles.filter((b) => b.request.phase === "quoted" || ["preparing", "started", "approved"].includes(b.request.phase)).length;
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

  const payTargetBundle = payTargetId ? bundles.find((b) => b.request.id === payTargetId) ?? null : null;
  const cancelTargetBundle = cancelTargetId ? bundles.find((b) => b.request.id === cancelTargetId) ?? null : null;
  const needsProfile = ctx.customerName === "未登録の依頼主" || !ctx.email;

  async function handlePayConfirm(profile?: { name: string; email: string; phone: string }) {
    if (!payTargetId || busy) return;
    setBusy(true);
    try {
      if (profile) await setInitialProfile(profile.name, profile.email, profile.phone);
      await payRequest(payTargetId);
      await refresh();
      setPayTargetId(null);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

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
        isDark={isDark}
        onToggleTheme={toggleTheme}
      />

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "var(--space-6) var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div style={{ textAlign: "center", fontSize: 11, color: "var(--color-neutral-600)", letterSpacing: "0.04em" }}>今日</div>
        {visible.map((m) => {
          const highlight = !!q;
          switch (m.kind) {
            case "text":
              return <TextBubble key={m.id} msg={m} highlight={highlight} />;
            case "files":
              return <FilesBubble key={m.id} msg={m} highlight={highlight} />;
            case "notice":
            case "system":
              return <NoticeBubble key={m.id} msg={m} />;
            case "menu_pick":
              return <MenuPickBubble key={m.id} msg={m} />;
            case "quote":
              return m.requestBundle ? (
                <RequestCard
                  key={m.id}
                  msg={m}
                  bundle={m.requestBundle}
                  refundPolicies={refundPolicies}
                  onPay={setPayTargetId}
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

      <Composer threadId={ctx.threadId} onSend={handleSend} onOpenMenuSheet={() => setShowMenuSheet(true)} />

      {showProgress && <ProgressPanel bundles={bundles} onClose={() => setShowProgress(false)} onCancel={(id) => { setShowProgress(false); setCancelTargetId(id); }} />}
      {showReports && <ReportsDialog bundles={bundles} ackedIds={ackedIds} onAck={ackReport} onClose={() => setShowReports(false)} />}
      {showMenuSheet && <MenuSheet menus={menus} onClose={() => setShowMenuSheet(false)} onSubmit={handleMenuSubmit} />}
      {payTargetBundle && (
        <PayDialog
          price={payTargetBundle.request.amount}
          needsProfile={needsProfile}
          confirming={busy}
          onClose={() => setPayTargetId(null)}
          onConfirm={handlePayConfirm}
        />
      )}
      {cancelTargetBundle && (
        <CancelDialog bundle={cancelTargetBundle} refundPolicies={refundPolicies} confirming={busy} onClose={() => setCancelTargetId(null)} onConfirm={handleCancelConfirm} />
      )}
      {showMyPage && (
        <MyPageDialog
          memberNo={ctx.memberNo}
          customerName={ctx.customerName}
          currentEmail={ctx.email}
          vault={initialVault}
          receptionName={ctx.receptionName}
          onClose={() => setShowMyPage(false)}
        />
      )}
    </div>
  );
}
