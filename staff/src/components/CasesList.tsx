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
  overdue: boolean;
  cancelRequested: boolean;
  customerName: string;
  threadId: string | null;
  archived: boolean;
  lastMessagePreview: string | null;
}

export default function CasesList({ rows: initialRows, canDelete }: { rows: CaseRow[]; canDelete: boolean }) {
  const [rows, setRows] = useState(initialRows);
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const visible = rows.filter((r) => !r.archived || showArchived);
  const archivedCount = rows.filter((r) => r.archived).length;

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
            <div style={{ flex: "none", fontSize: 13, fontFamily: "var(--font-heading)" }}>¥{r.amount.toLocaleString("ja-JP")}</div>
            {r.overdue && (
              <div style={{ flex: "none", fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "1px solid var(--stb-seal-ink)", color: "var(--stb-seal-ink)", whiteSpace: "nowrap" }}>
                納期超過
              </div>
            )}
            {r.cancelRequested && (
              <div style={{ flex: "none", fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "1px solid var(--stb-seal-ink)", color: "var(--stb-seal-ink)", whiteSpace: "nowrap" }}>
                キャンセル申請中
              </div>
            )}
            <div style={{ flex: "none", fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "1px solid var(--color-divider)", color: "var(--color-neutral-400)", whiteSpace: "nowrap" }}>
              {PHASE_LABEL[r.phase]}
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
