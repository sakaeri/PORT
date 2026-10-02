"use client";

import { useState } from "react";
import Link from "next/link";
import { PHASE_LABEL } from "@/lib/stage";
import { archiveCaseThread, unarchiveCaseThread, deleteCaseRequest } from "@/app/actions";
import RowKebabMenu from "@/components/RowKebabMenu";
import type { RequestPhase } from "@/lib/supabase/types";

export interface CaseRow {
  id: string;
  title: string;
  amount: number;
  phase: RequestPhase;
  paid: boolean;
  dueAt: string | null;
  overdue: boolean;
  dueSoon: boolean;
  // 着手済み（started）で、スタッフが完了報告を提出済みだが、まだマネージャー・
  // 本部メンバーが依頼主に送っていない状態（＝報告済み・承認待ち）。
  reportPending: boolean;
  cancelRequested: boolean;
  customerName: string;
  threadId: string | null;
  archived: boolean;
  lastMessagePreview: string | null;
}

type Filter = "all" | "preparing" | "awaitingReport" | "reportPending" | "completed" | "declined";

export default function CasesList({ rows: initialRows, canDelete, canSeeAmount }: { rows: CaseRow[]; canDelete: boolean; canSeeAmount: boolean }) {
  const [rows, setRows] = useState(initialRows);
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const active = rows.filter((r) => !r.archived);
  const archivedCount = rows.filter((r) => r.archived).length;
  // 「見送り」は件数が増えると埋もれて邪魔になるだけなので、「すべて」には
  // 出さず、専用のチップでだけ見られるようにする。
  const allCount = active.filter((r) => r.phase !== "declined").length;
  const preparingCount = active.filter((r) => r.phase === "preparing").length;
  const awaitingReportCount = active.filter((r) => r.phase === "started" && !r.reportPending).length;
  const reportPendingCount = active.filter((r) => r.reportPending).length;
  const completedCount = active.filter((r) => r.phase === "completed").length;
  const declinedCount = active.filter((r) => r.phase === "declined").length;
  const visible = rows
    .filter((r) => !r.archived || showArchived)
    .filter((r) => {
      if (filter === "preparing") return r.phase === "preparing";
      if (filter === "awaitingReport") return r.phase === "started" && !r.reportPending;
      if (filter === "reportPending") return r.reportPending;
      if (filter === "completed") return r.phase === "completed";
      if (filter === "declined") return r.phase === "declined";
      return r.phase !== "declined";
    });

  async function toggleArchive(r: CaseRow) {
    if (!r.threadId || busyId) return;
    setBusyId(r.id);
    const willArchive = !r.archived;
    try {
      if (willArchive) await archiveCaseThread(r.threadId);
      else await unarchiveCaseThread(r.threadId);
      setRows((rs) => rs.map((row) => (row.id === r.id ? { ...row, archived: willArchive } : row)));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(r: CaseRow) {
    if (busyId) return;
    const warning = r.paid
      ? `「${r.title}」を完全に削除します。この案件は入金済みで、その支払い記録も含めてトーク・完了報告・評価が全て元に戻せなくなります。よろしいですか？`
      : `「${r.title}」を完全に削除します。トーク・完了報告・評価が全て元に戻せなくなります。よろしいですか？`;
    if (!confirm(warning)) return;
    setBusyId(r.id);
    try {
      await deleteCaseRequest(r.id);
      setRows((rs) => rs.filter((row) => row.id !== r.id));
    } finally {
      setBusyId(null);
    }
  }

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "すべて", count: allCount },
    { key: "preparing", label: "未着手", count: preparingCount },
    { key: "awaitingReport", label: "報告前", count: awaitingReportCount },
    { key: "reportPending", label: "報告済み", count: reportPendingCount },
    { key: "completed", label: "完了", count: completedCount },
    { key: "declined", label: "見送り", count: declinedCount },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {chips.map((c) => {
          const on = filter === c.key;
          if (c.key !== "all" && c.count === 0) return null;
          return (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                height: 28,
                padding: "0 10px",
                cursor: "pointer",
                fontSize: 11.5,
                whiteSpace: "nowrap",
                color: on ? "var(--color-accent-100)" : "var(--color-neutral-400)",
                background: on ? "var(--color-accent-900)" : "transparent",
                border: `1px solid ${on ? "var(--color-accent)" : "var(--color-divider)"}`,
                borderRadius: "var(--radius-md)",
              }}
            >
              {c.label}
              {c.key !== "all" && <span>（{c.count}）</span>}
            </button>
          );
        })}
      </div>

      {archivedCount > 0 && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-neutral-400)" }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          非表示のものも表示（{archivedCount}件）
        </label>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visible.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", boxShadow: "var(--shadow-sm)", opacity: r.archived ? 0.55 : 1 }}>
            <Link href={`/cases/${r.id}`} style={{ flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}>
              <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
              <div style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{r.customerName}</div>
              <div style={{ fontSize: 11, color: "var(--color-neutral-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.lastMessagePreview ?? "まだ記録がありません"}</div>
            </Link>
            {canSeeAmount && <div style={{ flex: "none", fontSize: 13, fontFamily: "var(--font-heading)" }}>¥{r.amount.toLocaleString("ja-JP")}</div>}
            {r.dueAt && ["preparing", "started"].includes(r.phase) && (
              <div
                style={{
                  flex: "none",
                  fontSize: 11,
                  padding: "3px 10px",
                  borderRadius: 6,
                  border: `1px solid ${r.overdue ? "var(--stb-seal-ink)" : "var(--color-divider)"}`,
                  color: r.overdue ? "var(--stb-seal-ink)" : "var(--color-neutral-400)",
                  whiteSpace: "nowrap",
                }}
              >
                納期：{new Date(r.dueAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                {r.overdue && "（超過）"}
              </div>
            )}
            {r.cancelRequested && (
              <div style={{ flex: "none", fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "1px solid var(--stb-seal-ink)", color: "var(--stb-seal-ink)", whiteSpace: "nowrap" }}>
                キャンセル申請中
              </div>
            )}
            <div style={{ flex: "none", fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "1px solid var(--color-divider)", color: "var(--color-neutral-400)", whiteSpace: "nowrap" }}>
              {r.reportPending ? "報告済み（承認待ち）" : PHASE_LABEL[r.phase]}
            </div>
            <RowKebabMenu
              archived={r.archived}
              onToggleArchive={r.threadId ? () => toggleArchive(r) : undefined}
              onDelete={canDelete ? () => handleDelete(r) : undefined}
              busy={busyId === r.id}
            />
          </div>
        ))}
        {visible.length === 0 && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>該当する案件がありません。</div>}
      </div>
    </div>
  );
}
