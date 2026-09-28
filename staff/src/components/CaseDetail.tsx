"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Archive, ArrowCounterClockwise, Star, Plus, X } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { errorMessage } from "@/lib/errors";
import { PAYMENT_TIMING_LABEL, PHASE_LABEL } from "@/lib/stage";
import { computeRefund } from "@/lib/refund";
import {
  confirmPayment,
  confirmDeposit,
  confirmFinalPayment,
  startCaseRequest,
  submitCaseReport,
  approveCaseReport,
  declineQuote,
  confirmCancellation,
  setFinalPaymentLink,
  archiveCaseThread,
  unarchiveCaseThread,
  assignCaseStaff,
  unassignCaseStaff,
} from "@/app/actions";
import type { BankTransferInfo, Database, PaymentMethod, PaymentTiming, RequestPhase } from "@/lib/supabase/types";
import CaseThreadChat, { type CaseMessage } from "@/components/CaseThreadChat";

type RefundPolicyRow = Database["public"]["Tables"]["refund_policies"]["Row"];

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
  refundPolicies,
  customer,
  report,
  rating,
  caseThread,
  caseMessages,
  orgId,
  currentUserId,
  assignedStaff,
  availableStaff,
  canAssignStaff,
  canSeeFinance,
}: {
  request: {
    id: string;
    title: string;
    note: string | null;
    amount: number;
    phase: RequestPhase;
    createdAt: string;
    dueAt: string | null;
    cancelRequestedAt: string | null;
    paidAt: string | null;
    paymentTiming: PaymentTiming;
    depositPercent: number | null;
    depositAmount: number | null;
    depositPaidAt: string | null;
    payMethod: PaymentMethod | null;
    payStatus: string;
    bankTransferInfo: BankTransferInfo | null;
    cardPaymentLink: string | null;
    finalCardPaymentLink: string | null;
  };
  refundPolicies: RefundPolicyRow[];
  customer: { id: string; name: string } | null;
  report: { summary: string; noteToCustomer: string | null; details: { label: string; value: string }[]; pending: boolean } | null;
  rating: { stars: number | null; comment: string | null; skipped: boolean } | null;
  caseThread: { id: string; archived: boolean } | null;
  caseMessages: CaseMessage[];
  orgId: string;
  currentUserId: string;
  assignedStaff: { id: string; displayName: string }[];
  availableStaff: { id: string; displayName: string }[];
  canAssignStaff: boolean;
  // オーナー・マネージャーだけ金額・支払い・返金の情報を見られる。
  canSeeFinance: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  const handleStart = () =>
    runAction(
      () => startCaseRequest(request.id),
      request.phase === "quoted" ? "入金なしでこの案件に着手します。よろしいですか？" : undefined,
    );
  const handleConfirmPayment = () => runAction(() => confirmPayment(request.id), "入金を確認しましたか？この操作で着手も行われます。");
  const handleConfirmDeposit = () => runAction(() => confirmDeposit(request.id), "予約金の入金を確認しましたか？この操作で着手も行われます。");
  const handleConfirmFinal = () => runAction(() => confirmFinalPayment(request.id), request.paymentTiming === "deposit" ? "残金の入金を確認しましたか？" : "入金を確認しましたか？");
  const handleApproveReport = () => runAction(() => approveCaseReport(request.id), "この内容で依頼主に完了報告を送信します。よろしいですか？");
  const handleToggleArchive = () =>
    runAction(() => (caseThread?.archived ? unarchiveCaseThread(caseThread.id) : archiveCaseThread(caseThread!.id)));

  const canCancel = !["completed", "cancelled", "declined"].includes(request.phase);
  const isOverdue = request.dueAt != null && ["preparing", "started"].includes(request.phase) && new Date(request.dueAt) < new Date();
  // ここでの返金額はあくまで規定に基づく「目安」。自動では確定させず、
  // 事業主が金額を確認・上書きしてから confirmCancellation で確定する。
  const refund = computeRefund(
    {
      phase: request.phase,
      due_at: request.dueAt,
      paid_at: request.paidAt,
      amount: request.amount,
      payment_timing: request.paymentTiming,
      deposit_amount: request.depositAmount,
      deposit_paid_at: request.depositPaidAt,
    },
    refundPolicies,
  );
  const [showCancelPanel, setShowCancelPanel] = useState(false);
  const [cancelAmount, setCancelAmount] = useState<string>(String(refund.amount));

  const handleDecline = () => runAction(() => declineQuote(request.id), "この見積もりを見送りにします。よろしいですか？");
  const handleOpenCancelPanel = () => {
    setCancelAmount(String(refund.amount));
    setShowCancelPanel(true);
  };
  const handleConfirmCancel = () => {
    const amount = Number(cancelAmount);
    return runAction(
      async () => {
        await confirmCancellation(request.id, amount);
        setShowCancelPanel(false);
      },
      `返金額 ¥${Number.isFinite(amount) ? amount.toLocaleString("ja-JP") : cancelAmount} でキャンセルを確定します。よろしいですか？`,
    );
  };

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

        {canSeeFinance && request.cancelRequestedAt && canCancel && (
          <div style={{ fontSize: 12, color: "var(--stb-seal-ink)", padding: "8px 10px", borderRadius: "var(--radius-md)", background: "color-mix(in srgb, var(--stb-seal-ink) 10%, transparent)" }}>
            依頼主からキャンセルの申請があります（
            {new Date(request.cancelRequestedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            ）。内容を確認して下の「キャンセルを処理する」から返金額を確定してください。
          </div>
        )}

        {canSeeFinance && (
          <div style={{ fontSize: 12, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
            支払い：{PAYMENT_TIMING_LABEL[request.paymentTiming]}
            {request.paymentTiming === "deposit" && request.depositAmount != null && `（予約金 ¥${request.depositAmount.toLocaleString("ja-JP")}・${request.depositPercent}%）`}
            ・{request.payMethod === "card" ? "カード決済" : "銀行振込"}
          </div>
        )}
        {canSeeFinance && request.payMethod === "bank" && request.bankTransferInfo && (
          <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.7 }}>
            {request.bankTransferInfo.bankName} {request.bankTransferInfo.branchName}　{request.bankTransferInfo.accountType} {request.bankTransferInfo.accountNumber}　{request.bankTransferInfo.holder}
          </div>
        )}
        {canSeeFinance && request.payMethod === "card" && request.cardPaymentLink && (
          <div style={{ fontSize: 11.5, lineHeight: 1.7 }}>
            <a href={request.cardPaymentLink} target="_blank" rel="noreferrer" style={{ color: "var(--color-accent-300)" }}>
              {request.cardPaymentLink}
            </a>
          </div>
        )}
        {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}

        {request.phase === "quoted" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {canSeeFinance && request.paymentTiming === "prepay_full" && (
              <>
                <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>入金待ちです。チャットで送った決済案内の着金を確認したら押してください（入金確認と同時に着手します）。</div>
                <button onClick={handleConfirmPayment} disabled={busy} style={{ ...btn, alignSelf: "flex-start" }}>
                  {busy ? "処理中…" : "入金を確認して着手する"}
                </button>
              </>
            )}
            {canSeeFinance && request.paymentTiming === "deposit" && (
              <>
                <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>予約金の入金待ちです。着金を確認したら押してください（入金確認と同時に着手します）。</div>
                <button onClick={handleConfirmDeposit} disabled={busy} style={{ ...btn, alignSelf: "flex-start" }}>
                  {busy ? "処理中…" : "予約金の入金を確認して着手する"}
                </button>
              </>
            )}
            {(request.paymentTiming === "before_shipping" || request.paymentTiming === "postpay") && (
              <>
                <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>入金なしで着手できます。</div>
                <button onClick={handleStart} disabled={busy} style={{ ...btn, alignSelf: "flex-start" }}>
                  {busy ? "処理中…" : "着手する"}
                </button>
              </>
            )}
          </div>
        )}

        {request.phase === "preparing" && (
          <button onClick={handleStart} disabled={busy} style={{ ...btn, alignSelf: "flex-start" }}>
            {busy ? "処理中…" : "着手する"}
          </button>
        )}

        {request.phase === "started" && !report && <CompletionReportForm requestId={request.id} canSendDirectly={canSeeFinance} />}

        {request.phase === "started" && report?.pending && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)" }}>
            <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>{canSeeFinance ? "スタッフが提出した完了報告（未送信）" : "完了報告を提出しました。マネージャーの確認をお待ちください。"}</div>
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
            {report.noteToCustomer && <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>{report.noteToCustomer}</div>}
            {canSeeFinance && (
              <button onClick={handleApproveReport} disabled={busy} style={{ ...btn, alignSelf: "flex-start" }}>
                {busy ? "処理中…" : "承認して依頼主へ送る"}
              </button>
            )}
          </div>
        )}

        {canSeeFinance && request.payStatus === "paid" ? (
          request.phase !== "quoted" && <div style={{ fontSize: 12, color: "var(--color-accent-300)" }}>入金確認済み（¥{request.amount.toLocaleString("ja-JP")}）</div>
        ) : (
          canSeeFinance && (
            <>
              {request.paymentTiming === "deposit" && request.payStatus === "processing" && ["started", "completed"].includes(request.phase) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>残金 ¥{(request.amount - (request.depositAmount ?? 0)).toLocaleString("ja-JP")} は未確認です</span>
                    <button onClick={handleConfirmFinal} disabled={busy} style={{ ...btn, height: 32 }}>
                      {busy ? "処理中…" : "残金の入金を確認した"}
                    </button>
                  </div>
                  {request.payMethod === "card" && (
                    <FinalPaymentLinkForm requestId={request.id} currentLink={request.finalCardPaymentLink} />
                  )}
                </div>
              )}
              {(request.paymentTiming === "before_shipping" || request.paymentTiming === "postpay") && request.phase === "completed" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>入金は未確認です</span>
                  <button onClick={handleConfirmFinal} disabled={busy} style={{ ...btn, height: 32 }}>
                    {busy ? "処理中…" : "入金を確認した"}
                  </button>
                </div>
              )}
            </>
          )
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

        {canCancel && request.phase !== "quoted" && (
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {!showCancelPanel ? (
              <button
                onClick={handleOpenCancelPanel}
                disabled={busy}
                style={{
                  alignSelf: "flex-start",
                  height: 34,
                  padding: "0 12px",
                  cursor: "pointer",
                  fontSize: 12.5,
                  color: request.cancelRequestedAt ? "var(--stb-seal-ink)" : "var(--color-neutral-400)",
                  background: "transparent",
                  border: `1px solid ${request.cancelRequestedAt ? "var(--stb-seal-ink)" : "var(--color-divider)"}`,
                  borderRadius: "var(--radius-md)",
                }}
              >
                キャンセルを処理する
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)" }}>
                <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
                  規定上の目安：¥{refund.amount.toLocaleString("ja-JP")}（決済済み ¥{refund.paid.toLocaleString("ja-JP")}）。金額は下で変更できます。
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>返金額</span>
                  <input
                    type="number"
                    value={cancelAmount}
                    onChange={(e) => setCancelAmount(e.target.value)}
                    className="vid-input"
                    style={{ ...inputStyle, width: 140 }}
                  />
                  <span style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>円</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleConfirmCancel} disabled={busy} style={{ ...btn, height: 34 }}>
                    {busy ? "処理中…" : "この内容で確定する"}
                  </button>
                  <button
                    onClick={() => setShowCancelPanel(false)}
                    disabled={busy}
                    style={{ height: 34, padding: "0 12px", cursor: "pointer", fontSize: 12.5, color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
                  >
                    やめる
                  </button>
                </div>
              </div>
            )}
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
            {report.noteToCustomer && <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>{report.noteToCustomer}</div>}
          </div>
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

function CompletionReportForm({ requestId, canSendDirectly }: { requestId: string; canSendDirectly: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [deliverables, setDeliverables] = useState("");
  const [delivery, setDelivery] = useState("");
  const [noteToCustomer, setNoteToCustomer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      await submitCaseReport(requestId, summary, noteToCustomer, deliverables, delivery);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {!canSendDirectly && (
        <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
          提出するとマネージャー・オーナーの確認待ちになります。承認されるまで依頼主には送られません。
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
      <input value={deliverables} onChange={(e) => setDeliverables(e.target.value)} placeholder="納品物（任意）" className="vid-input" style={inputStyle} />
      <input value={delivery} onChange={(e) => setDelivery(e.target.value)} placeholder="受け渡し方法（任意）" className="vid-input" style={inputStyle} />
      <textarea
        value={noteToCustomer}
        onChange={(e) => setNoteToCustomer(e.target.value)}
        placeholder="依頼主へのメッセージ（任意）"
        rows={2}
        className="vid-input"
        style={{ ...inputStyle, height: "auto", padding: "8px 10px", resize: "none" }}
      />
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

// 予約金＋カード決済のとき、残金用の決済リンクを登録して依頼主トークに送る。
// 最初のカード決済リンクは予約金専用の金額で固定されているため、残金分は
// 別のリンクとして案内する必要がある。
function FinalPaymentLinkForm({ requestId, currentLink }: { requestId: string; currentLink: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (saving || !url.trim()) return;
    setError("");
    setSaving(true);
    try {
      await setFinalPaymentLink(requestId, url);
      setOpen(false);
      setUrl("");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e, "送信できませんでした"));
    } finally {
      setSaving(false);
    }
  }

  if (currentLink && !open) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
        <span style={{ color: "var(--color-neutral-500)" }}>残金の決済リンク送信済み：</span>
        <a href={currentLink} target="_blank" rel="noreferrer" style={{ color: "var(--color-accent-300)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {currentLink}
        </a>
        <button onClick={() => setOpen(true)} style={{ flex: "none", cursor: "pointer", fontSize: 11.5, color: "var(--color-neutral-500)", background: "transparent", border: "none", textDecoration: "underline" }}>
          作り直す
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ ...btn, height: 32, alignSelf: "flex-start" }}>
        残金の決済リンクを送る
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="残金分のカード決済リンク（URL）"
        className="vid-input"
        style={{ ...inputStyle, flex: 1, minWidth: 200 }}
      />
      {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} disabled={saving || !url.trim()} style={{ ...btn, height: 36 }}>
          {saving ? "送信中…" : "このリンクを送る"}
        </button>
        <button onClick={() => setOpen(false)} style={{ ...btn, height: 36, color: "var(--color-neutral-400)", background: "transparent", borderColor: "var(--color-divider)" }}>
          キャンセル
        </button>
      </div>
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
