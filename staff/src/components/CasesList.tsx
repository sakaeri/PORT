"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, ArrowCounterClockwise } from "@phosphor-icons/react";
import { PHASE_LABEL } from "@/lib/stage";
import { archiveCaseThread, unarchiveCaseThread } from "@/app/actions";
import type { RequestPhase } from "@/lib/supabase/types";

export interface CaseRow {
  id: string;
  title: string;
  amount: number;
  phase: RequestPhase;
  customerName: string;
  threadId: string | null;
  archived: boolean;
}

const smallBtn: React.CSSProperties = {
  height: 28,
  width: 28,
  flex: "none",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  color: "var(--color-neutral-500)",
  background: "transparent",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
};

export default function CasesList({ rows: initialRows }: { rows: CaseRow[] }) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {archivedCount > 0 && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-neutral-400)" }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          アーカイブ済みも表示（{archivedCount}件）
        </label>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visible.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", boxShadow: "var(--shadow-sm)", opacity: r.archived ? 0.55 : 1 }}>
            <Link href={`/cases/${r.id}`} style={{ flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}>
              <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
              <div style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{r.customerName}</div>
            </Link>
            <div style={{ flex: "none", fontSize: 13, fontFamily: "var(--font-heading)" }}>¥{r.amount.toLocaleString("ja-JP")}</div>
            <div style={{ flex: "none", fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "1px solid var(--color-divider)", color: "var(--color-neutral-400)", whiteSpace: "nowrap" }}>
              {PHASE_LABEL[r.phase]}
            </div>
            {r.threadId && (
              <button onClick={() => toggleArchive(r)} disabled={busyId === r.id} aria-label={r.archived ? "一覧に戻す" : "アーカイブ"} style={smallBtn}>
                {r.archived ? <ArrowCounterClockwise size={13} /> : <Archive size={13} />}
              </button>
            )}
          </div>
        ))}
        {visible.length === 0 && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>該当する案件がありません。</div>}
      </div>
    </div>
  );
}
