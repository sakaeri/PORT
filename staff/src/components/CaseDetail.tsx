"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Archive, ArrowCounterClockwise, Star } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { PAYMENT_TIMING_LABEL, PHASE_LABEL } from "@/lib/stage";
import {
  confirmPayment,
  confirmDeposit,
  confirmFinalPayment,
  approveToStart,
  startCaseRequest,
  declineCaseRequest,
  submitCaseReport,
  archiveCaseThread,
  unarchiveCaseThread,
} from "@/app/actions";
import type { BankTransferInfo, PaymentMethod, PaymentTiming, RequestPhase } from "@/lib/supabase/types";
import CaseThreadChat, { type CaseMessage } from "@/components/CaseThreadChat";

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
  rating,
  caseThread,
  caseMessages,
  orgId,
  currentUserId,
}: {
  request: {
    id: string;
    title: string;
    note: string | null;
    amount: number;
    phase: RequestPhase;
    createdAt: string;
    paymentTiming: PaymentTiming;
    depositPercent: number | null;
    depositAmount: number | null;
    depositPaidAt: string | null;
    payMethod: PaymentMethod | null;
    payStatus: string;
    bankTransferInfo: BankTransferInfo | null;
    cardPaymentLink: string | null;
  };
  customer: { id: string; name: string } | null;
  report: { summary: string; noteToCustomer: string | null; details: { label: string; value: string }[] } | null;
  rating: { stars: number | null; comment: string | null; skipped: boolean } | null;
  caseThread: { id: string; archived: boolean } | null;
  caseMessages: CaseMessage[];
  orgId: string;
  currentUserId: string;
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
      setError(e instanceof Error ? e.message : "操作に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  const handleStart = () => runAction(() => startCaseRequest(request.id));
  const handleDecline = () => runAction(() => declineCaseRequest(request.id), "この見積もりを取り下げます。よろしいですか？");
  const handleConfirmPayment = () => runAction(() => confirmPayment(request.id), "入金を確認しましたか？この操作で着手できるようになります。");
  const handleConfirmDeposit = () => runAction(() => confirmDeposit(request.id), "予約金の入金を確認しましたか？この操作で着手できるようになります。");
  const handleApproveToStart = () => runAction(() => approveToStart(request.id), "入金なしでこの見積もりを承認し、着手できるようにします。よろしいですか？");
  const handleConfirmFinal = () => runAction(() => confirmFinalPayment(request.id), request.paymentTiming === "deposit" ? "残金の入金を確認しましたか？" : "入金を確認しましたか？");
  const handleToggleArchive = () =>
    runAction(() => (caseThread?.archived ? unarchiveCaseThread(caseThread.id) : archiveCaseThread(caseThread!.id)));

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
            {caseThread.archived ? "一覧に戻す" : "アーカイブ"}
          </button>
        )}
      </div>

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
          <span style={{ fontSize: 20, fontFamily: "var(--font-heading)", fontWeight: 600 }}>¥{request.amount.toLocaleString("ja-JP")}</span>
          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "1px solid var(--color-divider)", color: "var(--color-neutral-400)" }}>{PHASE_LABEL[request.phase]}</span>
        </div>

        <div style={{ fontSize: 12, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
          支払い：{PAYMENT_TIMING_LABEL[request.paymentTiming]}
          {request.paymentTiming === "deposit" && request.depositAmount != null && `（予約金 ¥${request.depositAmount.toLocaleString("ja-JP")}・${request.depositPercent}%）`}
          ・{request.payMethod === "card" ? "カード決済" : "銀行振込"}
        </div>
        {request.payMethod === "bank" && request.bankTransferInfo && (
          <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.7 }}>
            {request.bankTransferInfo.bankName} {request.bankTransferInfo.branchName}　{request.bankTransferInfo.accountType} {request.bankTransferInfo.accountNumber}　{request.bankTransferInfo.holder}
          </div>
        )}
        {request.payMethod === "card" && request.cardPaymentLink && (
          <div style={{ fontSize: 11.5, lineHeight: 1.7 }}>
            <a href={request.cardPaymentLink} target="_blank" rel="noreferrer" style={{ color: "var(--color-accent-300)" }}>
              {request.cardPaymentLink}
            </a>
          </div>
        )}
        {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}

        {request.phase === "quoted" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {request.paymentTiming === "prepay_full" && (
              <>
                <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>入金待ちです。チャットで送った決済案内の着金を確認したら押してください。</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleConfirmPayment} disabled={busy} style={{ ...btn, alignSelf: "flex-start" }}>
                    {busy ? "処理中…" : "入金を確認した"}
                  </button>
                  <button onClick={handleDecline} disabled={busy} style={{ ...btn, alignSelf: "flex-start", color: "var(--color-neutral-400)", background: "transparent", borderColor: "var(--color-divider)" }}>
                    見積もりを取り下げる
                  </button>
                </div>
              </>
            )}
            {request.paymentTiming === "deposit" && (
              <>
                <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>予約金の入金待ちです。着金を確認したら押してください。</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleConfirmDeposit} disabled={busy} style={{ ...btn, alignSelf: "flex-start" }}>
                    {busy ? "処理中…" : "予約金の入金を確認した"}
                  </button>
                  <button onClick={handleDecline} disabled={busy} style={{ ...btn, alignSelf: "flex-start", color: "var(--color-neutral-400)", background: "transparent", borderColor: "var(--color-divider)" }}>
                    見積もりを取り下げる
                  </button>
                </div>
              </>
            )}
            {(request.paymentTiming === "before_shipping" || request.paymentTiming === "postpay") && (
              <>
                <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>入金なしで着手できます。承認すると着手できるようになります。</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleApproveToStart} disabled={busy} style={{ ...btn, alignSelf: "flex-start" }}>
                    {busy ? "処理中…" : "承認する"}
                  </button>
                  <button onClick={handleDecline} disabled={busy} style={{ ...btn, alignSelf: "flex-start", color: "var(--color-neutral-400)", background: "transparent", borderColor: "var(--color-divider)" }}>
                    見積もりを取り下げる
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {request.phase === "preparing" && (
          <button onClick={handleStart} disabled={busy} style={{ ...btn, alignSelf: "flex-start" }}>
            {busy ? "処理中…" : "着手する"}
          </button>
        )}

        {request.phase === "started" && <CompletionReportForm requestId={request.id} />}

        {request.payStatus === "paid" ? (
          request.phase !== "quoted" && <div style={{ fontSize: 12, color: "var(--color-accent-300)" }}>入金確認済み（¥{request.amount.toLocaleString("ja-JP")}）</div>
        ) : (
          <>
            {request.paymentTiming === "deposit" && request.payStatus === "processing" && ["started", "completed"].includes(request.phase) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>残金 ¥{(request.amount - (request.depositAmount ?? 0)).toLocaleString("ja-JP")} は未確認です</span>
                <button onClick={handleConfirmFinal} disabled={busy} style={{ ...btn, height: 32 }}>
                  {busy ? "処理中…" : "残金の入金を確認した"}
                </button>
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

function CompletionReportForm({ requestId }: { requestId: string }) {
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
      setError(e instanceof Error ? e.message : "送信できませんでした");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ ...btn, alignSelf: "flex-start" }}>
        完了報告を送る
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
          {saving ? "送信中…" : "この内容で完了報告する"}
        </button>
        <button onClick={() => setOpen(false)} style={{ ...btn, color: "var(--color-neutral-400)", background: "transparent", borderColor: "var(--color-divider)" }}>
          キャンセル
        </button>
      </div>
    </div>
  );
}
