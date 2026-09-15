"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, PaperPlaneTilt, Paperclip, Buildings, ArrowSquareOut, Trash, ChatCircleText, Star } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { createClient } from "@/lib/supabase/client";
import { sendStaffMessage, deleteMessage, markThreadRead, convertCustomerToOrg, createCaseRequest, sendTemplateMessage } from "@/app/actions";
import { EMPTY_ORG_FORM, OrgAccountFields, slugify, type OrgAccountFormState } from "@/components/OrgAccountFields";
import WorkMemos, { type WorkMemo } from "@/components/WorkMemos";
import { PHASE_LABEL } from "@/lib/stage";
import type { BankTransferInfo, PaymentMethod, PaymentTiming, RequestPhase } from "@/lib/supabase/types";

export interface ThreadAttachment {
  id: string;
  file_name: string;
  mime: string | null;
  bytes: number | null;
}

export interface ThreadReport {
  summary: string;
  details: { label: string; value: string }[];
  noteToCustomer: string | null;
}

export interface ThreadMessage {
  id: string;
  sender_id: string | null;
  sender_role: "owner" | "reception" | "creator" | "client" | null;
  kind: string;
  body: string | null;
  payload: unknown;
  sent_at: string;
  deleted_at: string | null;
  attachments: ThreadAttachment[];
  requestPhase?: RequestPhase | null;
  requestAmount?: number | null;
  report?: ThreadReport | null;
}

type Message = ThreadMessage;

const smallBtn: React.CSSProperties = {
  height: 30,
  padding: "0 12px",
  cursor: "pointer",
  fontSize: 11.5,
  whiteSpace: "nowrap",
  color: "var(--color-accent)",
  background: "transparent",
  border: "1px solid var(--color-accent)",
  borderRadius: "var(--radius-md)",
};
const card: React.CSSProperties = {
  padding: 16,
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-divider)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

function TemplateRow({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "7px 9px",
        cursor: "pointer",
        textAlign: "left",
        fontSize: 12.5,
        color: "var(--color-text)",
        background: "transparent",
        border: "none",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <PaperPlaneTilt size={12} color="var(--color-neutral-500)" style={{ flex: "none" }} />
    </button>
  );
}

function summarize(m: Message): string {
  const p = m.payload as { title?: string; menuLabel?: string; total?: number; summary?: string; formLabel?: string };
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
      return `［確認事項］${p.formLabel ?? m.body ?? ""}`;
    case "system":
      return m.body ?? "［システム］";
    default:
      return m.body ?? `［${m.kind}］`;
  }
}

const PHASE_BADGE_COLOR: Partial<Record<RequestPhase, { color: string; border: string }>> = {
  quoted: { color: "var(--color-neutral-400)", border: "var(--color-divider)" },
  preparing: { color: "var(--color-accent-300)", border: "var(--color-accent-700)" },
  started: { color: "var(--color-accent-100)", border: "var(--color-accent-700)" },
  approved: { color: "var(--color-accent-100)", border: "var(--color-accent-700)" },
  completed: { color: "var(--color-accent)", border: "var(--color-accent)" },
  cancelled: { color: "var(--color-neutral-400)", border: "var(--color-divider)" },
  declined: { color: "var(--color-neutral-400)", border: "var(--color-divider)" },
};

function QuoteBubble({ msg }: { msg: Message }) {
  const p = msg.payload as { title?: string; note?: string; due?: string };
  const phase = msg.requestPhase;
  const badge = phase ? (PHASE_BADGE_COLOR[phase] ?? PHASE_BADGE_COLOR.quoted) : null;

  return (
    <div style={{ width: "min(280px, 100%)", padding: "11px 13px", borderRadius: "var(--radius-lg)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent-800)", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--color-accent-200)" }}>見積もり</span>
        {phase && badge && (
          <span style={{ marginLeft: "auto", flex: "none", fontSize: 10, padding: "2px 8px", borderRadius: 6, border: `1px solid ${badge.border}`, color: badge.color, whiteSpace: "nowrap" }}>
            {PHASE_LABEL[phase]}
          </span>
        )}
      </div>
      <div style={{ fontSize: 14, fontFamily: "var(--font-heading)", fontWeight: headingWeight, lineHeight: 1.3 }}>{p.title}</div>
      {p.note && <div style={{ fontSize: 12, opacity: 0.85 }}>{p.note}</div>}
      {msg.requestAmount != null && <div style={{ fontSize: 17, fontFamily: "var(--font-heading)", fontWeight: 600 }}>¥{msg.requestAmount.toLocaleString("ja-JP")}</div>}
      {p.due && <div style={{ fontSize: 11.5, color: "var(--color-neutral-400)" }}>対応の目安：{p.due}</div>}

      {phase === "completed" && msg.report && (
        <div style={{ borderTop: "1px solid var(--color-accent-800)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 10.5, color: "var(--color-accent-200)" }}>完了報告</div>
          <div style={{ fontSize: 12.5 }}>{msg.report.summary}</div>
          {msg.report.details.map((d, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 12 }}>
              <span style={{ width: 60, flex: "none", color: "var(--color-neutral-400)" }}>{d.label}</span>
              <span style={{ minWidth: 0, flex: 1 }}>{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CustomerThread({
  customer,
  thread,
  initialMessages,
  role,
  currentUserId,
  orgId,
  isHq,
  convertedOrg,
  templates,
  menus,
  memos,
  ratings,
  latestRequest,
  cardPaymentEnabled,
  defaultBankInfo,
  defaultCardPaymentLink,
}: {
  customer: { id: string; name: string; memberNo: string | null };
  thread: { id: string; archived: boolean } | null;
  initialMessages: Message[];
  role: "owner" | "reception";
  currentUserId: string;
  orgId: string;
  isHq: boolean;
  convertedOrg: { displayName: string; slug: string | null } | null;
  templates: { id: string; label: string; note: string | null; fieldCount: number }[];
  menus: MenuOption[];
  memos: WorkMemo[];
  ratings: { average: number | null; count: number; items: { stars: number | null; comment: string | null }[] };
  latestRequest: { id: string; title: string; amount: number; phase: RequestPhase } | null;
  cardPaymentEnabled: boolean;
  defaultBankInfo: BankTransferInfo;
  defaultCardPaymentLink: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (thread) void markThreadRead(thread.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const refresh = useCallback(async () => {
    if (!thread) return;
    const supabase = createClient(orgId);
    const { data } = await supabase
      .from("messages")
      .select("*, message_attachments(*), requests(phase, amount, completion_reports(summary, details, note_to_customer))")
      .eq("thread_id", thread.id)
      .order("sent_at", { ascending: true });
    if (data) {
      setMessages(
        data.map((m) => {
          const req = Array.isArray(m.requests) ? m.requests[0] : m.requests;
          const reportRaw = req ? (Array.isArray(req.completion_reports) ? req.completion_reports[0] : req.completion_reports) : null;
          return {
            ...m,
            attachments: m.message_attachments ?? [],
            requestPhase: req?.phase ?? null,
            requestAmount: req?.amount ?? null,
            report: reportRaw ? { summary: reportRaw.summary, details: reportRaw.details ?? [], noteToCustomer: reportRaw.note_to_customer } : null,
          };
        }),
      );
    }
    // 開いている間に届いた分もその場で既読にする
    void markThreadRead(thread.id);
  }, [thread, orgId]);

  useEffect(() => {
    if (!thread) return;
    const supabase = createClient(orgId);
    const channel = supabase
      .channel(`staff-thread-${thread.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `thread_id=eq.${thread.id}` }, refresh)
      .subscribe();
    // WebSocket通知だけに頼らず、数秒おきのポーリングも保険として併用する
    // （接続直後の認証タイミング等でイベントを取りこぼしても、数秒以内に追いつく）。
    const interval = setInterval(refresh, 4000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [thread, orgId, refresh]);

  async function send() {
    if (!thread || sending || !draft.trim()) return;
    setSending(true);
    const body = draft.trim();
    try {
      await sendStaffMessage(thread.id, body);
      setMessages((m) => [
        ...m,
        { id: `temp-${Date.now()}`, sender_id: currentUserId, sender_role: role, kind: "text", body, payload: {}, sent_at: new Date().toISOString(), deleted_at: null, attachments: [] },
      ]);
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteMessage(m: Message) {
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
    <div style={{ display: "flex", height: "100%" }}>
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid var(--color-divider)" }}>
        <Link href="/customers" aria-label="依頼主一覧に戻る" style={{ display: "flex", color: "var(--color-neutral-400)" }}>
          <ArrowLeft size={17} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{customer.name}</div>
          <div style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{customer.memberNo ?? "—"}</div>
        </div>
      </div>

      {isHq && (
        <div style={{ padding: "14px 20px 0" }}>
          {convertedOrg ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--color-accent-200)" }}>
              <Buildings size={14} />
              {convertedOrg.displayName} として登録済み
              {convertedOrg.slug && (
                <a href={`https://port.s-stylegolf.com/${convertedOrg.slug}`} target="_blank" rel="noreferrer" style={{ display: "flex", color: "var(--color-neutral-400)" }} aria-label="サイトを開く">
                  <ArrowSquareOut size={13} />
                </a>
              )}
            </div>
          ) : (
            <ConvertSection customerId={customer.id} customerName={customer.name} />
          )}
        </div>
      )}

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        {!thread && <div style={{ fontSize: 13, color: "var(--color-neutral-500)" }}>まだやり取りがありません。</div>}
        {messages.map((m) => {
          const isStaff = m.sender_role === "owner" || m.sender_role === "reception";
          const isOwn = m.sender_id === currentUserId;
          return (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: isStaff ? "flex-end" : "flex-start" }}>
              {m.deleted_at ? (
                <div style={{ maxWidth: "70%", padding: "9px 13px", fontSize: 12.5, fontStyle: "italic", color: "var(--color-neutral-500)" }}>
                  削除されました
                </div>
              ) : m.kind === "quote" ? (
                <QuoteBubble msg={m} />
              ) : (
                <div
                  style={{
                    maxWidth: "70%",
                    padding: "9px 13px",
                    borderRadius: "var(--radius-lg)",
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    background: isStaff ? "var(--color-accent-900)" : "var(--color-surface)",
                    border: isStaff ? "1px solid var(--color-accent-800)" : "1px solid var(--color-divider)",
                  }}
                >
                  {summarize(m)}
                </div>
              )}
              {!m.deleted_at && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, color: "var(--color-neutral-600)" }}>
                    {new Date(m.sent_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {isOwn && (
                    <button onClick={() => handleDeleteMessage(m)} disabled={busy} aria-label="削除" style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}>
                      <Trash size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {thread && templates.length > 0 && showTemplates && (
        <div style={{ flex: "none", margin: "0 20px", padding: 8, display: "flex", flexDirection: "column", gap: 10, maxHeight: 240, overflowY: "auto", borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)" }}>
          {templates.some((t) => t.fieldCount > 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.05em", color: "var(--color-neutral-500)", padding: "0 9px" }}>入力してもらう</div>
              {templates
                .filter((t) => t.fieldCount > 0)
                .map((t) => (
                  <TemplateRow
                    key={t.id}
                    label={`${t.label}（${t.fieldCount}項目）`}
                    disabled={busy}
                    onClick={async () => {
                      if (!thread) return;
                      setBusy(true);
                      try {
                        await sendTemplateMessage(thread.id, t.id);
                        setShowTemplates(false);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                ))}
            </div>
          )}
          {templates.some((t) => t.fieldCount === 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.05em", color: "var(--color-neutral-500)", padding: "0 9px" }}>送るだけ</div>
              {templates
                .filter((t) => t.fieldCount === 0)
                .map((t) => (
                  <TemplateRow
                    key={t.id}
                    label={t.label}
                    disabled={busy}
                    onClick={() => {
                      setDraft(t.note ?? t.label);
                      setShowTemplates(false);
                    }}
                  />
                ))}
            </div>
          )}
        </div>
      )}
      {thread && (
        <div style={{ flex: "none", display: "flex", gap: 8, padding: "14px 20px", borderTop: "1px solid var(--color-divider)" }}>
          {templates.length > 0 && (
            <button
              onClick={() => setShowTemplates((v) => !v)}
              aria-label="テンプレを選ぶ"
              style={{ flex: "none", width: 40, height: 40, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
            >
              <ChatCircleText size={16} />
            </button>
          )}
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
      {thread && (
        <div style={{ flex: "none", padding: "0 20px 12px", fontSize: 10.5, color: "var(--color-neutral-600)", display: "flex", alignItems: "center", gap: 5 }}>
          <Paperclip size={11} />
          ファイルの添付は次のフェーズで対応します。
        </div>
      )}
    </div>

    <div style={{ flex: "none", width: 300, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 18, borderLeft: "1px solid var(--color-divider)" }}>
      {!isHq && <RatingsSummary ratings={ratings} />}
      <WorkMemos customerId={customer.id} currentUserId={currentUserId} initialMemos={memos} />
      {!isHq && (
        <CaseSummarySection
          thread={thread}
          customerId={customer.id}
          menus={menus}
          latestRequest={latestRequest}
          cardPaymentEnabled={cardPaymentEnabled}
          defaultBankInfo={defaultBankInfo}
          defaultCardPaymentLink={defaultCardPaymentLink}
        />
      )}
    </div>
    </div>
  );
}

function RatingsSummary({ ratings }: { ratings: { average: number | null; count: number; items: { stars: number | null; comment: string | null }[] } }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={ratings.count === 0}
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--color-neutral-400)", background: "transparent", border: "none", cursor: ratings.count === 0 ? "default" : "pointer", padding: 0 }}
      >
        依頼主の評価{ratings.count > 0 ? `（平均★${ratings.average?.toFixed(1)}・${ratings.count}件）` : "（まだありません）"}
      </button>
      {open && ratings.items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)" }}>
          {ratings.items.map((r, i) => (
            <div key={i} style={{ fontSize: 12 }}>
              <div style={{ display: "flex", gap: 2 }}>
                {Array.from({ length: 5 }).map((_, j) => (
                  <Star key={j} size={12} weight={r.stars != null && j < r.stars ? "fill" : "regular"} color="var(--color-accent-300)" />
                ))}
              </div>
              {r.comment && <div style={{ marginTop: 2 }}>{r.comment}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CaseSummarySection({
  thread,
  customerId,
  menus,
  latestRequest,
  cardPaymentEnabled,
  defaultBankInfo,
  defaultCardPaymentLink,
}: {
  thread: { id: string; archived: boolean } | null;
  customerId: string;
  menus: MenuOption[];
  latestRequest: { id: string; title: string; amount: number; phase: RequestPhase } | null;
  cardPaymentEnabled: boolean;
  defaultBankInfo: BankTransferInfo;
  defaultCardPaymentLink: string;
}) {
  const router = useRouter();
  const [showDialog, setShowDialog] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 11.5, color: "var(--color-neutral-400)" }}>このトークの依頼</span>
        {thread && (
          <button
            onClick={() => setShowDialog(true)}
            style={{ flex: "none", height: 24, padding: "0 10px", cursor: "pointer", fontSize: 11, color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-sm)" }}
          >
            見積もり
          </button>
        )}
      </div>
      {showDialog && thread && (
        <QuoteDialog
          threadId={thread.id}
          customerId={customerId}
          menus={menus}
          cardPaymentEnabled={cardPaymentEnabled}
          defaultBankInfo={defaultBankInfo}
          defaultCardPaymentLink={defaultCardPaymentLink}
          onClose={() => setShowDialog(false)}
          onCreated={(requestId) => {
            setShowDialog(false);
            router.push(`/cases/${requestId}`);
          }}
        />
      )}
      {latestRequest ? (
        <Link
          href={`/cases/${latestRequest.id}`}
          style={{ display: "flex", flexDirection: "column", gap: 4, padding: 10, borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", background: "var(--color-surface)", textDecoration: "none", color: "inherit" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{latestRequest.title}</span>
            <span style={{ flex: "none", fontSize: 10, padding: "2px 8px", borderRadius: 6, border: "1px solid var(--color-divider)", color: "var(--color-neutral-400)" }}>{PHASE_LABEL[latestRequest.phase]}</span>
          </div>
          <div style={{ fontSize: 14, fontFamily: "var(--font-heading)", fontWeight: 600 }}>¥{latestRequest.amount.toLocaleString("ja-JP")}</div>
        </Link>
      ) : (
        <div style={{ fontSize: 12, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
          まだ依頼はありません。会話の内容が正式な依頼になったら見積もりを発行してください。
        </div>
      )}
    </div>
  );
}

function ConvertSection({ customerId, customerName }: { customerId: string; customerName: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<OrgAccountFormState>({ ...EMPTY_ORG_FORM, display_name: customerName, slug: slugify(customerName) });
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ slug: string; email: string; password: string } | null>(null);

  function set<K extends keyof OrgAccountFormState>(key: K, value: string) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "display_name" && !slugTouched) next.slug = slugify(value);
      if (key === "slug") setSlugTouched(true);
      return next;
    });
  }

  async function submit() {
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      const result = await convertCustomerToOrg(customerId, form);
      setCreated({ slug: result.slug, email: form.owner_email, password: form.owner_password });
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録できませんでした");
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <div style={{ ...card, border: "1px solid var(--color-accent-800)", background: "var(--color-accent-900)" }}>
        <div style={{ fontSize: 13.5, color: "var(--color-accent-100)" }}>「{form.display_name}」を事業者として登録しました。次の内容をお伝えください。</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
          <div>URL：<b>port.s-stylegolf.com/{created.slug}</b></div>
          <div>ログインメール：<b>{created.email}</b></div>
          <div>初期パスワード：<b style={{ letterSpacing: "0.04em" }}>{created.password}</b></div>
        </div>
        <div style={{ fontSize: 11, color: "var(--color-accent-200)", lineHeight: 1.6 }}>パスワードはこの画面にしか出ません。忘れずにコピーして伝えてください。</div>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={smallBtn}>
        事業者として登録
      </button>
    );
  }

  return (
    <div style={card}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 14 }}>事業者として登録</div>
      <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
        この依頼主をそのまま新しい事業者にします。表示名は問い合わせ時の名前を引き継いでいるので、必要に応じて書き換えてください。
      </div>
      <OrgAccountFields form={form} set={set} />
      {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} disabled={saving} style={{ ...smallBtn, height: 36, color: "var(--color-accent-100)", background: "var(--color-accent-900)" }}>
          {saving ? "登録中…" : "この内容で登録"}
        </button>
        <button onClick={() => setOpen(false)} style={{ ...smallBtn, height: 36, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
          キャンセル
        </button>
      </div>
    </div>
  );
}

interface MenuOption {
  id: string;
  label: string;
  note: string | null;
  price: number;
  payout: number;
  leadHours: number;
}

interface CustomItem {
  label: string;
  price: number;
  qty: number;
}

const PAYMENT_TIMING_OPTIONS: { value: PaymentTiming; label: string }[] = [
  { value: "prepay_full", label: "先払い" },
  { value: "deposit", label: "予約金の先払い" },
  { value: "before_shipping", label: "発送前入金" },
  { value: "postpay", label: "後払い" },
];

function pillStyle(active: boolean): React.CSSProperties {
  return {
    height: 30,
    padding: "0 12px",
    cursor: "pointer",
    fontSize: 12,
    whiteSpace: "nowrap",
    color: active ? "var(--color-accent-100)" : "var(--color-neutral-400)",
    background: active ? "var(--color-accent-900)" : "transparent",
    border: "1px solid",
    borderColor: active ? "var(--color-accent-800)" : "var(--color-divider)",
    borderRadius: "var(--radius-md)",
  };
}

function QuoteDialog({
  threadId,
  customerId,
  menus,
  cardPaymentEnabled,
  defaultBankInfo,
  defaultCardPaymentLink,
  onClose,
  onCreated,
}: {
  threadId: string;
  customerId: string;
  menus: MenuOption[];
  cardPaymentEnabled: boolean;
  defaultBankInfo: BankTransferInfo;
  defaultCardPaymentLink: string;
  onClose: () => void;
  onCreated: (requestId: string) => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [customItems, setCustomItems] = useState<CustomItem[]>([]);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [saveAsMenu, setSaveAsMenu] = useState(false);
  const [paymentTiming, setPaymentTiming] = useState<PaymentTiming>("prepay_full");
  const [depositPercent, setDepositPercent] = useState("30");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("bank");
  const [bankInfo, setBankInfo] = useState<BankTransferInfo>(defaultBankInfo);
  const [cardPaymentLink, setCardPaymentLink] = useState(defaultCardPaymentLink);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setBankField<K extends keyof BankTransferInfo>(key: K, value: string) {
    setBankInfo((b) => ({ ...b, [key]: value }));
  }

  function bump(menuId: string, delta: number) {
    setQty((q) => ({ ...q, [menuId]: Math.max(0, (q[menuId] ?? 0) + delta) }));
  }

  function addCustomItem() {
    const price = Number(customPrice);
    if (!customLabel.trim() || !Number.isFinite(price) || price < 0) return;
    setCustomItems((rows) => [...rows, { label: customLabel.trim(), price, qty: 1 }]);
    setCustomLabel("");
    setCustomPrice("");
  }

  const menuItems = menus.filter((m) => (qty[m.id] ?? 0) > 0).map((m) => ({ menuId: m.id as string | null, label: m.label, price: m.price, payout: m.payout, qty: qty[m.id] }));
  const allItems = [...menuItems, ...customItems.map((c) => ({ menuId: null as string | null, label: c.label, price: c.price, payout: 0, qty: c.qty }))];
  const total = allItems.reduce((sum, it) => sum + it.price * it.qty, 0);
  const depositAmount = paymentTiming === "deposit" ? Math.round((total * (Number(depositPercent) || 0)) / 100) : null;

  async function submit() {
    if (saving || allItems.length === 0) return;
    setError("");
    setSaving(true);
    try {
      const requestId = await createCaseRequest(threadId, customerId, {
        items: allItems,
        note,
        due,
        saveAsMenu,
        paymentTiming,
        depositPercent: paymentTiming === "deposit" ? Number(depositPercent) || 0 : undefined,
        payMethod,
        bankInfo: payMethod === "bank" ? bankInfo : undefined,
        cardPaymentLink: payMethod === "card" ? cardPaymentLink : undefined,
      });
      onCreated(requestId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "作成できませんでした");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center", padding: 20, background: "color-mix(in srgb, var(--color-bg) 72%, transparent)" }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(480px, 100%)", maxHeight: "85vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, padding: 20, borderRadius: "var(--radius-lg)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", boxShadow: "var(--shadow-lg)" }}
      >
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 16 }}>見積もりを発行</div>
        <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
          このトークの内容を正式な依頼にします。発行するとトークに見積もりカードが入ります。
        </div>

        {menus.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>受付メニュー</span>
            {menus.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</div>
                  <div style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>
                    ¥{m.price.toLocaleString("ja-JP")}・納期{m.leadHours}時間
                  </div>
                </div>
                <button onClick={() => bump(m.id, -1)} disabled={!qty[m.id]} style={stepperBtn}>
                  −
                </button>
                <span style={{ width: 20, textAlign: "center", fontSize: 13 }}>{qty[m.id] ?? 0}</span>
                <button onClick={() => bump(m.id, 1)} style={stepperBtn}>
                  ＋
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button onClick={() => setShowCustomForm((v) => !v)} style={{ alignSelf: "flex-start", fontSize: 11.5, color: "var(--color-accent)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
            白紙から見積もる（メニュー外）
          </button>
          {showCustomForm && (
            <div style={{ display: "flex", gap: 6 }}>
              <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="件名" className="vid-input" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
              <input value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} type="number" min={0} placeholder="金額" className="vid-input" style={{ ...inputStyle, width: 100 }} />
              <button onClick={addCustomItem} style={{ ...smallBtn, height: 36 }}>
                追加
              </button>
            </div>
          )}
          {customItems.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
              <span style={{ flex: 1, minWidth: 0 }}>{c.label}</span>
              <span style={{ color: "var(--color-neutral-500)" }}>¥{c.price.toLocaleString("ja-JP")}</span>
              <button onClick={() => setCustomItems((rows) => rows.filter((_, j) => j !== i))} style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}>
                <Trash size={12} />
              </button>
            </div>
          ))}
          {customItems.length > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--color-neutral-400)" }}>
              <input type="checkbox" checked={saveAsMenu} onChange={(e) => setSaveAsMenu(e.target.checked)} />
              この内容を受付メニューにも追加する
            </label>
          )}
        </div>

        <input value={due} onChange={(e) => setDue(e.target.value)} placeholder="対応の目安（例：3日後）任意" className="vid-input" style={inputStyle} />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="補足メモ（依頼主にも表示されます）任意"
          rows={2}
          className="vid-input"
          style={{ ...inputStyle, height: "auto", padding: "8px 10px", resize: "none" }}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 10, borderTop: "1px solid var(--color-divider)" }}>
          <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>支払いタイミング</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PAYMENT_TIMING_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => setPaymentTiming(opt.value)} style={pillStyle(paymentTiming === opt.value)}>
                {opt.label}
              </button>
            ))}
          </div>
          {paymentTiming === "deposit" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12.5 }}>予約金</span>
              <input
                type="number"
                min={1}
                max={100}
                value={depositPercent}
                onChange={(e) => setDepositPercent(e.target.value)}
                className="vid-input"
                style={{ ...inputStyle, width: 64 }}
              />
              <span style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>%（¥{(depositAmount ?? 0).toLocaleString("ja-JP")}）・残金は完了後にご案内します</span>
            </div>
          )}
          {(paymentTiming === "before_shipping" || paymentTiming === "postpay") && (
            <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
              入金確認なしで着手できます。{paymentTiming === "before_shipping" ? "発送前" : "対応完了後"}に入金をご案内ください。
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>支払い方法</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setPayMethod("bank")} style={pillStyle(payMethod === "bank")}>
              銀行振込
            </button>
            {cardPaymentEnabled && (
              <button onClick={() => setPayMethod("card")} style={pillStyle(payMethod === "card")}>
                カード決済
              </button>
            )}
          </div>
          {payMethod === "bank" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input value={bankInfo.holder ?? ""} onChange={(e) => setBankField("holder", e.target.value)} placeholder="口座名義" className="vid-input" style={inputStyle} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <input value={bankInfo.bankName ?? ""} onChange={(e) => setBankField("bankName", e.target.value)} placeholder="銀行名" className="vid-input" style={inputStyle} />
                <input value={bankInfo.branchName ?? ""} onChange={(e) => setBankField("branchName", e.target.value)} placeholder="支店名" className="vid-input" style={inputStyle} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <input value={bankInfo.accountType ?? ""} onChange={(e) => setBankField("accountType", e.target.value)} placeholder="口座種別（普通・当座）" className="vid-input" style={inputStyle} />
                <input value={bankInfo.accountNumber ?? ""} onChange={(e) => setBankField("accountNumber", e.target.value)} placeholder="口座番号" className="vid-input" style={inputStyle} />
              </div>
            </div>
          ) : (
            <input
              value={cardPaymentLink}
              onChange={(e) => setCardPaymentLink(e.target.value)}
              placeholder="カード決済のリンク（依頼主に直接表示されます）"
              className="vid-input"
              style={inputStyle}
            />
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--color-divider)" }}>
          <span style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>請求額（依頼主に表示）</span>
          <span style={{ fontSize: 18, fontFamily: "var(--font-heading)", fontWeight: 600 }}>¥{total.toLocaleString("ja-JP")}</span>
        </div>

        {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={submit} disabled={saving || allItems.length === 0} style={{ ...smallBtn, height: 36, color: "var(--color-accent-100)", background: "var(--color-accent-900)" }}>
            {saving ? "送信中…" : "見積もりを送る"}
          </button>
          <button onClick={onClose} style={{ ...smallBtn, height: 36, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}

const stepperBtn: React.CSSProperties = {
  flex: "none",
  width: 24,
  height: 24,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  fontSize: 14,
  color: "var(--color-accent)",
  background: "transparent",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-sm)",
};

const inputStyle: React.CSSProperties = {
  height: 36,
  padding: "0 10px",
  font: "inherit",
  fontSize: 13,
  color: "var(--color-text)",
  background: "var(--color-bg)",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
  outline: "none",
};
