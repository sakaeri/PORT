"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Archive, ArrowCounterClockwise, Star, Plus, X, CircleNotch, FilePdf, Image as ImageIcon } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { errorMessage } from "@/lib/errors";
import { CADENCE_LABEL, PAYMENT_TIMING_LABEL, PHASE_LABEL } from "@/lib/stage";
import {
  startCaseRequest,
  submitCaseReport,
  approveCaseReport,
  declineQuote,
  archiveCaseThread,
  unarchiveCaseThread,
  assignCaseStaff,
  unassignCaseStaff,
  cancelSubscription,
} from "@/app/actions";
import type { PaymentTiming, RequestPhase, SubscriptionCadence } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/client";
import CaseThreadChat, { type CaseMessage } from "@/components/CaseThreadChat";
import QuoteDialog, { type MenuOption, type CustomItem } from "@/components/QuoteDialog";

const card: React.CSSProperties = {
  padding: 16,
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-divider)",
  boxShadow: "var(--shadow-sm)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const btn: React.CSSProperties = {
  height: 38,
  padding: "0 16px",
  cursor: "pointer",
  fontSize: 13,
  color: "var(--color-accent-100)",
  background: "var(--color-accent-900)",
  border: "1px solid var(--color-accent)",
  borderRadius: "var(--radius-md)",
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

export default function CaseDetail({
  request,
  customer,
  report,
  reportFieldPresets,
  rating,
  caseThread,
  caseMessages,
  orgId,
  currentUserId,
  assignedStaff,
  availableStaff,
  canAssignStaff,
  canSeeFinance,
  canApprove,
  subscription,
  customerThreadId,
  menus,
  requestItems,
}: {
  request: {
    id: string;
    title: string;
    note: string | null;
    amount: number;
    phase: RequestPhase;
    createdAt: string;
    dueAt: string | null;
    paidAt: string | null;
    paymentTiming: PaymentTiming;
    depositAmount: number | null;
    depositPaidAt: string | null;
    payStatus: string;
    hourlyRate: number | null;
    hourlyCap: number | null;
  };
  customer: { id: string; name: string } | null;
  report: { summary: string; details: { label: string; value: string }[]; pending: boolean; attachments: { id: string; path: string; name: string; label: string | null }[] } | null;
  reportFieldPresets: { id: string; label: string; kind: string; required: boolean }[];
  rating: { stars: number | null; comment: string | null; skipped: boolean } | null;
  caseThread: { id: string; archived: boolean } | null;
  caseMessages: CaseMessage[];
  orgId: string;
  currentUserId: string;
  assignedStaff: { id: string; displayName: string }[];
  availableStaff: { id: string; displayName: string }[];
  canAssignStaff: boolean;
  // 請求金額・支払い状況・時間精算単価は本部（owner）のみ見られる。マネージャーが
  // 金額でやる／やらないを判断しないよう、案件詳細では本部以外に一切見せない。
  canSeeFinance: boolean;
  // 完了報告をそのまま依頼主へ送れるか（オーナー・マネージャー）。金額とは別軸。
  canApprove: boolean;
  // この案件が定期対応（毎週・毎月）から生まれたものなら、その定期対応自体の情報。
  subscription: { id: string; cadence: SubscriptionCadence; active: boolean; nextDueAt: string | null } | null;
  // 完了した単発案件から「この内容で定期を提案」する時に使う。依頼主の
  // 窓口トーク（threadId）が無い＝依頼主アカウントが削除済みなどの場合は
  // 提案できない。
  customerThreadId: string | null;
  menus: MenuOption[];
  requestItems: CustomItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showRecurringDialog, setShowRecurringDialog] = useState(false);

  async function runAction(action: () => Promise<void>, confirmMessage?: string) {
    if (busy) return;
    if (confirmMessage && !confirm(confirmMessage)) return;
    setBusy(true);
    setError("");
    try {
      await action();
      router.refresh();
    } catch (e) {
      setError(errorMessage(e, "操作に失敗しました"));
    } finally {
      setBusy(false);
    }
  }

  const handleStart = () => runAction(() => startCaseRequest(request.id));
  const handleApproveReport = () => runAction(() => approveCaseReport(request.id), "この内容で依頼主に完了報告を送信します。よろしいですか？");
  const handleToggleArchive = () =>
    runAction(() => (caseThread?.archived ? unarchiveCaseThread(caseThread.id) : archiveCaseThread(caseThread!.id)));
  const handleCancelSubscription = () =>
    runAction(() => cancelSubscription(subscription!.id), "定期対応を停止します。すでに支払い済みの今回分には影響しません。よろしいですか？");

  const canCancel = !["completed", "cancelled", "declined"].includes(request.phase);
  const isOverdue = request.dueAt != null && ["preparing", "started"].includes(request.phase) && new Date(request.dueAt) < new Date();

  const handleDecline = () => runAction(() => declineQuote(request.id), "この見積もりを見送りにします。よろしいですか？");

  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 16, maxWidth: 640, width: "100%", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/cases" aria-label="案件一覧に戻る" style={{ display: "flex", color: "var(--color-neutral-400)" }}>
          <ArrowLeft size={17} />
        </Link>
        <div style={{ flex: 1, fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 20 }}>{request.title}</div>
        {caseThread && (
          <button
            onClick={handleToggleArchive}
            disabled={busy}
            style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", cursor: "pointer", fontSize: 12, color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
          >
            {caseThread.archived ? <ArrowCounterClockwise size={13} /> : <Archive size={13} />}
            {caseThread.archived ? "一覧に戻す" : "非表示にする"}
          </button>
        )}
      </div>

      {(assignedStaff.length > 0 || canAssignStaff) && (
        <CaseStaffControl requestId={request.id} assignedStaff={assignedStaff} availableStaff={availableStaff} canAssign={canAssignStaff} />
      )}

      <div style={card}>
        {customer && (
          <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>
            依頼主：
            <Link href={`/customers/${customer.id}`} style={{ color: "var(--color-accent-300)" }}>
              {customer.name}
            </Link>
          </div>
        )}
        {request.note && <div style={{ fontSize: 13, lineHeight: 1.6 }}>{request.note}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {canSeeFinance && <span style={{ fontSize: 20, fontFamily: "var(--font-heading)", fontWeight: 600 }}>¥{request.amount.toLocaleString("ja-JP")}</span>}
          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "1px solid var(--color-divider)", color: "var(--color-neutral-400)" }}>{PHASE_LABEL[request.phase]}</span>
          {request.dueAt && ["preparing", "started"].includes(request.phase) && (
            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: `1px solid ${isOverdue ? "var(--stb-seal-ink)" : "var(--color-divider)"}`, color: isOverdue ? "var(--stb-seal-ink)" : "var(--color-neutral-400)" }}>
              納期：{new Date(request.dueAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              {isOverdue && "（超過）"}
            </span>
          )}
        </div>

        {canSeeFinance && (
          <div style={{ fontSize: 12, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>支払い：{PAYMENT_TIMING_LABEL[request.paymentTiming]}</div>
        )}
        {canSeeFinance && request.hourlyRate != null && (
          <div style={{ fontSize: 12, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
            時間精算：時間単価¥{request.hourlyRate.toLocaleString("ja-JP")}・上限¥{(request.hourlyCap ?? 0).toLocaleString("ja-JP")}
          </div>
        )}
        {canApprove && subscription && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
            <span>
              定期対応（{CADENCE_LABEL[subscription.cadence]}）{subscription.active ? "・有効" : "・停止済み"}
              {subscription.active && subscription.nextDueAt && `・次回 ${new Date(subscription.nextDueAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" })}`}
            </span>
            {subscription.active && (
              <button
                onClick={handleCancelSubscription}
                disabled={busy}
                style={{ height: 26, padding: "0 10px", cursor: "pointer", fontSize: 11.5, color: "var(--color-neutral-300)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
              >
                定期対応を停止
              </button>
            )}
          </div>
        )}
        {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}

        {request.phase === "quoted" && (
          <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>
            依頼主がチャージ残高から直接お支払いいただくと、着手待ち（準備中）になります。着手はこの後、担当者が「着手する」を押して開始してください。
          </div>
        )}

        {request.phase === "preparing" && (
          <button onClick={handleStart} disabled={busy} style={{ ...btn, alignSelf: "flex-start" }}>
            {busy ? "処理中…" : "着手する"}
          </button>
        )}

        {request.phase === "started" && !report && (
          <CompletionReportForm requestId={request.id} canSendDirectly={canApprove} presets={reportFieldPresets} />
        )}

        {request.phase === "started" && report?.pending && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)" }}>
            <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>{canApprove ? "スタッフが提出した完了報告（未送信）" : "完了報告を提出しました。秘書の確認をお待ちください。"}</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>{report.summary}</div>
            {report.details.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {report.details.map((d, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5 }}>
                    <span style={{ width: 72, flex: "none", color: "var(--color-neutral-500)" }}>{d.label}</span>
                    <span style={{ minWidth: 0, flex: 1 }}>{d.value}</span>
                  </div>
                ))}
              </div>
            )}
            <ReportAttachmentList attachments={report.attachments} orgId={orgId} />
            {canApprove && (
              <button onClick={handleApproveReport} disabled={busy} style={{ ...btn, alignSelf: "flex-start" }}>
                {busy ? "処理中…" : "承認して依頼主へ送る"}
              </button>
            )}
          </div>
        )}

        {canSeeFinance && request.payStatus === "paid" && request.phase !== "quoted" && (
          <div style={{ fontSize: 12, color: "var(--color-accent-300)" }}>入金確認済み（¥{request.amount.toLocaleString("ja-JP")}）</div>
        )}

        {canCancel && request.phase === "quoted" && (
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 10 }}>
            <button
              onClick={handleDecline}
              disabled={busy}
              style={{ height: 34, padding: "0 12px", cursor: "pointer", fontSize: 12.5, color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
            >
              この見積もりを見送りにする
            </button>
          </div>
        )}

        {request.phase === "completed" && report && (
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>完了報告</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>{report.summary}</div>
            {report.details.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
                {report.details.map((d, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5 }}>
                    <span style={{ width: 72, flex: "none", color: "var(--color-neutral-500)" }}>{d.label}</span>
                    <span style={{ minWidth: 0, flex: 1 }}>{d.value}</span>
                  </div>
                ))}
              </div>
            )}
            <ReportAttachmentList attachments={report.attachments} orgId={orgId} />
            {canApprove && !subscription && customerThreadId && customer && (
              <button
                onClick={() => setShowRecurringDialog(true)}
                style={{ alignSelf: "flex-start", height: 32, padding: "0 12px", cursor: "pointer", fontSize: 12, color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}
              >
                この内容で定期を提案
              </button>
            )}
          </div>
        )}

        {showRecurringDialog && customerThreadId && customer && (
          <QuoteDialog
            threadId={customerThreadId}
            customerId={customer.id}
            menus={menus}
            title="この内容で定期を提案"
            description="今回と同じ内容を引き継いだ見積もりです。頻度（毎週・毎月）を選び、金額を見直してから送ってください。"
            initialCustomItems={requestItems}
            onClose={() => setShowRecurringDialog(false)}
            onCreated={(newRequestId) => {
              setShowRecurringDialog(false);
              router.push(`/cases/${newRequestId}`);
            }}
          />
        )}

        <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>依頼主からの評価</div>
          {rating && !rating.skipped ? (
            <>
              <div style={{ display: "flex", gap: 2 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={14} weight={rating.stars != null && i < rating.stars ? "fill" : "regular"} color="var(--color-accent-300)" />
                ))}
              </div>
              {rating.comment && <div style={{ fontSize: 13 }}>{rating.comment}</div>}
            </>
          ) : (
            <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>まだ評価はありません。</div>
          )}
        </div>
      </div>

      {caseThread && (
        <div style={card}>
          <CaseThreadChat threadId={caseThread.id} orgId={orgId} currentUserId={currentUserId} initialMessages={caseMessages} />
        </div>
      )}
    </div>
  );
}

interface ReportRow {
  label: string;
  value: string;
  kind: "text" | "url";
}

function reportAttachmentIcon(name: string) {
  return /\.pdf$/i.test(name) ? FilePdf : ImageIcon;
}

function CompletionReportForm({
  requestId,
  canSendDirectly,
  presets,
}: {
  requestId: string;
  canSendDirectly: boolean;
  presets: { id: string; label: string; kind: string; required: boolean }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  // 必須項目は、押さないと存在に気づかれにくいので最初から行を出しておく。
  const [rows, setRows] = useState<ReportRow[]>(() => presets.filter((p) => p.required).map((p) => ({ label: p.label, value: "", kind: p.kind === "url" ? "url" : "text" })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function addPresetRow(p: { label: string; kind: string }) {
    setRows((r) => [...r, { label: p.label, value: "", kind: p.kind === "url" ? "url" : "text" }]);
  }
  function addCustomRow() {
    setRows((r) => [...r, { label: "", value: "", kind: "text" }]);
  }
  function updateRow(i: number, patch: Partial<ReportRow>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  function missingRequiredLabels(): string[] {
    return presets.filter((p) => p.required && !rows.find((r) => r.label === p.label)?.value.trim()).map((p) => p.label);
  }

  async function submit() {
    if (saving) return;
    setError("");
    const missing = missingRequiredLabels();
    if (missing.length > 0) {
      setError(`必須項目が未入力です：${missing.join("、")}`);
      return;
    }
    setSaving(true);
    try {
      const details = rows.map((r) => ({ label: r.label, value: r.value }));
      await submitCaseReport(requestId, summary, details);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e, "送信できませんでした"));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ ...btn, alignSelf: "flex-start" }}>
        {canSendDirectly ? "完了報告を送る" : "完了報告を提出する"}
      </button>
    );
  }

  const unusedPresets = presets.filter((p) => !rows.some((r) => r.label === p.label));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {!canSendDirectly && (
        <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
          提出すると秘書・本部メンバーの確認待ちになります。承認されるまで依頼主には送られません。
        </div>
      )}
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="対応内容の要約（依頼主に表示されます）"
        rows={3}
        className="vid-input"
        style={{ ...inputStyle, height: "auto", padding: "8px 10px", resize: "none" }}
      />

      {rows.map((row, i) => {
        const preset = presets.find((p) => p.label === row.label && (p.kind === "url") === (row.kind === "url"));
        return (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {preset ? (
              <span style={{ width: 110, flex: "none", fontSize: 13 }}>
                {row.label}
                {preset.required && <span style={{ color: "var(--color-accent-200)" }}> *</span>}
              </span>
            ) : (
              <input
                value={row.label}
                onChange={(e) => updateRow(i, { label: e.target.value })}
                placeholder="項目名"
                className="vid-input"
                style={{ ...inputStyle, width: 110, flex: "none" }}
              />
            )}
            <input
              value={row.value}
              onChange={(e) => updateRow(i, { value: e.target.value })}
              placeholder={row.kind === "url" ? "URL（https://...）" : "内容"}
              type={row.kind === "url" ? "url" : "text"}
              className="vid-input"
              style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            />
            <button onClick={() => removeRow(i)} aria-label="削除" style={{ flex: "none", width: 30, height: 30, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}>
              <X size={14} />
            </button>
          </div>
        );
      })}
      {unusedPresets.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {unusedPresets.map((p) => (
            <button
              key={p.id}
              onClick={() => addPresetRow(p)}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 28, padding: "0 10px", cursor: "pointer", fontSize: 11.5, color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}
            >
              <Plus size={11} />
              {p.label}
              {p.required && "＊"}
            </button>
          ))}
          <button
            onClick={addCustomRow}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 28, padding: "0 10px", cursor: "pointer", fontSize: 11.5, color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
          >
            <Plus size={11} />
            カスタム項目
          </button>
        </div>
      )}

      {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} disabled={saving || !summary.trim()} style={btn}>
          {saving ? "送信中…" : canSendDirectly ? "この内容で完了報告する" : "この内容で提出する"}
        </button>
        <button onClick={() => setOpen(false)} style={{ ...btn, color: "var(--color-neutral-400)", background: "transparent", borderColor: "var(--color-divider)" }}>
          キャンセル
        </button>
      </div>
    </div>
  );
}

function ReportAttachmentList({ attachments, orgId }: { attachments: { id: string; path: string; name: string; label: string | null }[]; orgId: string }) {
  const [openingId, setOpeningId] = useState<string | null>(null);

  async function open(path: string, id: string) {
    if (openingId) return;
    setOpeningId(id);
    try {
      const supabase = createClient(orgId);
      const { data, error } = await supabase.storage.from("attachments").createSignedUrl(path, 60);
      if (error || !data?.signedUrl) throw error ?? new Error("URLを発行できませんでした");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } finally {
      setOpeningId(null);
    }
  }

  if (attachments.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {attachments.map((a) => {
        const Icon = reportAttachmentIcon(a.name);
        return (
          <button
            key={a.id}
            onClick={() => open(a.path, a.id)}
            disabled={openingId === a.id}
            style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, padding: "6px 8px", cursor: openingId === a.id ? "wait" : "pointer", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", background: "var(--color-bg)" }}
          >
            {openingId === a.id ? <CircleNotch size={14} style={{ flex: "none", color: "var(--color-accent)", animation: "vid-spin 0.7s linear infinite" }} /> : <Icon size={14} style={{ flex: "none", color: "var(--color-accent)" }} />}
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{a.label ? `${a.label}：${a.name}` : a.name}</span>
          </button>
        );
      })}
    </div>
  );
}

// 窓口所属だけでは案件が見えないスタッフ（dept_leader）を、この案件に
// 個別に割り当てる。割り当てられると、この案件の社内トークにアクセス
// できるようになる。
function CaseStaffControl({
  requestId,
  assignedStaff,
  availableStaff,
  canAssign,
}: {
  requestId: string;
  assignedStaff: { id: string; displayName: string }[];
  availableStaff: { id: string; displayName: string }[];
  canAssign: boolean;
}) {
  const router = useRouter();
  const [staff, setStaff] = useState(assignedStaff);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pickable = availableStaff.filter((s) => !staff.some((a) => a.id === s.id));

  async function add(profileId: string) {
    const person = availableStaff.find((s) => s.id === profileId);
    if (!person || busy) return;
    setBusy(true);
    setError("");
    try {
      await assignCaseStaff(requestId, profileId);
      setStaff((rows) => [...rows, person]);
      setAdding(false);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e, "追加できませんでした"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(profileId: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await unassignCaseStaff(requestId, profileId);
      setStaff((rows) => rows.filter((r) => r.id !== profileId));
      router.refresh();
    } catch (e) {
      setError(errorMessage(e, "解除できませんでした"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>担当スタッフ：</span>
      {staff.length === 0 && !canAssign && <span style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>未割り当て</span>}
      {staff.map((s) => (
        <span
          key={s.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            height: 26,
            padding: "0 8px",
            fontSize: 11.5,
            color: "var(--color-accent-100)",
            background: "var(--color-accent-900)",
            border: "1px solid var(--color-accent)",
            borderRadius: "var(--radius-md)",
          }}
        >
          {s.displayName}
          {canAssign && (
            <button
              onClick={() => remove(s.id)}
              disabled={busy}
              aria-label={`${s.displayName}を解除`}
              style={{ display: "flex", cursor: "pointer", color: "var(--color-accent-100)", background: "transparent", border: "none", padding: 0 }}
            >
              <X size={11} />
            </button>
          )}
        </span>
      ))}
      {canAssign &&
        (adding ? (
          <select
            autoFocus
            defaultValue=""
            disabled={busy}
            onChange={(e) => e.target.value && add(e.target.value)}
            onBlur={() => setAdding(false)}
            className="vid-input"
            style={{ height: 28, padding: "0 6px", fontSize: 11.5, color: "var(--color-text)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
          >
            <option value="" disabled>
              選択…
            </option>
            {pickable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        ) : (
          <button
            onClick={() => setAdding(true)}
            disabled={pickable.length === 0}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              height: 26,
              padding: "0 8px",
              cursor: pickable.length === 0 ? "default" : "pointer",
              fontSize: 11.5,
              color: pickable.length === 0 ? "var(--color-neutral-500)" : "var(--color-accent)",
              background: "transparent",
              border: `1px solid ${pickable.length === 0 ? "var(--color-divider)" : "var(--color-accent)"}`,
              borderRadius: "var(--radius-md)",
            }}
          >
            <Plus size={11} />
            スタッフ追加
          </button>
        ))}
      {error && <span style={{ fontSize: 11, color: "var(--color-accent-200)" }}>{error}</span>}
    </div>
  );
}
