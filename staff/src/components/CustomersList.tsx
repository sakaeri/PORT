"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowSquareOut, Buildings, Archive, ArrowCounterClockwise, Trash } from "@phosphor-icons/react";
import { archiveThread, unarchiveThread, deleteCustomer } from "@/app/actions";

interface CustomerRow {
  id: string;
  name: string;
  memberNo: string | null;
  active: boolean;
  creatorName: string | null;
  convertedOrg: { displayName: string; slug: string | null } | null;
  thread: { id: string; archived: boolean } | null;
  lastMessagePreview: string | null;
  unread: boolean;
}

const smallBtn: React.CSSProperties = {
  height: 28,
  width: 28,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  color: "var(--color-neutral-500)",
  background: "transparent",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
};

export default function CustomersList({ rows: initialRows, isHq }: { rows: CustomerRow[]; isHq: boolean }) {
  const [rows, setRows] = useState(initialRows);
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const visible = rows.filter((c) => c.active || showArchived);
  const archivedCount = rows.filter((c) => !c.active).length;

  async function toggleArchive(c: CustomerRow) {
    if (!c.thread || busyId) return;
    setBusyId(c.id);
    const willArchive = !c.thread.archived;
    try {
      if (willArchive) await archiveThread(c.thread.id);
      else await unarchiveThread(c.thread.id);
      setRows((r) => r.map((row) => (row.id === c.id && row.thread ? { ...row, active: !willArchive, thread: { ...row.thread, archived: willArchive } } : row)));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(c: CustomerRow) {
    if (busyId) return;
    if (!confirm(`「${c.name}」を完全に削除します。トーク・案件・評価など全ての履歴が元に戻せなくなります。よろしいですか？`)) return;
    setBusyId(c.id);
    try {
      await deleteCustomer(c.id);
      setRows((r) => r.filter((row) => row.id !== c.id));
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
        {visible.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", opacity: c.active ? 1 : 0.55 }}>
            <Link href={`/customers/${c.id}`} style={{ flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 14, fontWeight: c.unread ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                {c.unread && (
                  <span style={{ flex: "none", fontSize: 10, fontWeight: 700, color: "var(--color-bg)", background: "var(--color-accent-200)", borderRadius: "var(--radius-sm)", padding: "1.5px 6px" }}>
                    未読
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-neutral-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.lastMessagePreview ?? "まだやり取りがありません"}</div>
            </Link>
            {!isHq && (
              <div style={{ flex: "none", fontSize: 11.5, color: "var(--color-neutral-500)" }}>{c.creatorName ? `担当: ${c.creatorName}` : "未割り当て"}</div>
            )}
            {isHq && c.convertedOrg && (
              <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--color-accent-200)" }}>
                <Buildings size={14} />
                {c.convertedOrg.displayName} として登録済み
                {c.convertedOrg.slug && (
                  <a href={`https://port.s-stylegolf.com/${c.convertedOrg.slug}`} target="_blank" rel="noreferrer" style={{ display: "flex", color: "var(--color-neutral-400)" }} aria-label="サイトを開く">
                    <ArrowSquareOut size={13} />
                  </a>
                )}
              </div>
            )}
            {c.thread && (
              <button onClick={() => toggleArchive(c)} disabled={busyId === c.id} aria-label={c.thread.archived ? "一覧に戻す" : "アーカイブ"} style={smallBtn}>
                {c.thread.archived ? <ArrowCounterClockwise size={13} /> : <Archive size={13} />}
              </button>
            )}
            <button onClick={() => handleDelete(c)} disabled={busyId === c.id} aria-label="削除" style={{ ...smallBtn, color: "var(--color-accent-200)" }}>
              <Trash size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
