"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { createClient } from "@/lib/supabase/client";
import { archiveThread, unarchiveThread, ensureStaffThread, removeStaffMember } from "@/app/actions";
import StaffThreadPane from "@/components/StaffThreadPane";
import Modal from "@/components/Modal";
import RowKebabMenu from "@/components/RowKebabMenu";
import { InviteAdmin, type Department } from "@/components/StaffAdmin";
import type { StaffRole } from "@/lib/supabase/types";

export interface StaffDirectoryRow {
  id: string;
  displayName: string;
  role: StaffRole;
  departmentIds: string[];
  threadId: string | null;
  archived: boolean;
  lastMessagePreview: string | null;
  unread: boolean;
}

interface RosterEntry {
  id: string;
  displayName: string;
  lastMessagePreview: string | null;
  unread: boolean;
  isSelf: boolean;
}

export default function StaffChat({
  currentUserId,
  currentRole,
  orgId,
  canAdmin,
  canBrowseStaff,
  staff: initialStaff,
  selfEntry,
  departments,
}: {
  currentUserId: string;
  currentRole: StaffRole | "reception";
  orgId: string;
  // オーナー：招待・役職変更・削除ができる。
  canAdmin: boolean;
  // オーナー・マネージャー：スタッフ一覧を見てチャットできる（マネージャーは
  // 一覧・チャットだけで管理操作はできない）。falseなら自分の「本部」との
  // やり取り画面だけが表示される（スタッフ=dept_leader向け）。
  canBrowseStaff: boolean;
  staff: StaffDirectoryRow[];
  // マネージャーの一覧の先頭に出す「本部」＝自分自身の窓口担当スレッド。
  // オーナーには不要（オーナー自身がHQなので、自分宛のスレッドという概念がない）。
  selfEntry?: { lastMessagePreview: string | null; unread: boolean };
  departments: Department[];
}) {
  const router = useRouter();
  const [staff, setStaff] = useState(initialStaff);
  const [selectedId, setSelectedId] = useState<string | null>(canBrowseStaff ? null : currentUserId);
  const [showInvite, setShowInvite] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 一覧の最終メッセージ・未読はこのコンポーネント自身では再取得せず、
  // ページ全体(staff/page.tsx)を router.refresh() で再取得させる
  // （依頼主一覧のCustomersListと同じパターン）。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from a server-refetched prop (router.refresh()), not state derived from other client state
    setStaff(initialStaff);
  }, [initialStaff]);

  useEffect(() => {
    if (!canBrowseStaff) return;
    const supabase = createClient(orgId);
    const channel = supabase
      .channel(`staff-list-${orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "threads" }, () => router.refresh())
      .subscribe();
    const interval = setInterval(() => router.refresh(), 4000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [orgId, canBrowseStaff, router]);

  const otherStaff = staff.filter((s) => s.id !== currentUserId);
  const archivedCount = otherStaff.filter((s) => s.archived).length;
  const visibleOtherStaff = otherStaff.filter((s) => !s.archived || showArchived);
  const entries: RosterEntry[] = canAdmin
    ? visibleOtherStaff.map((s) => ({ id: s.id, displayName: s.displayName, lastMessagePreview: s.lastMessagePreview, unread: s.unread, isSelf: false }))
    : [
        { id: currentUserId, displayName: "本部", lastMessagePreview: selfEntry?.lastMessagePreview ?? null, unread: selfEntry?.unread ?? false, isSelf: true },
        ...visibleOtherStaff.map((s) => ({ id: s.id, displayName: s.displayName, lastMessagePreview: s.lastMessagePreview, unread: s.unread, isSelf: false })),
      ];

  const selectedEntry = selectedId ? entries.find((e) => e.id === selectedId) : null;
  const selectedStaff = selectedEntry && !selectedEntry.isSelf ? otherStaff.find((s) => s.id === selectedEntry.id) : null;

  async function toggleArchiveStaff(s: StaffDirectoryRow) {
    if (busyId) return;
    setBusyId(s.id);
    try {
      const threadId = s.threadId ?? (await ensureStaffThread(s.id));
      if (s.archived) await unarchiveThread(threadId);
      else await archiveThread(threadId);
      setStaff((rows) => rows.map((r) => (r.id === s.id ? { ...r, archived: !s.archived, threadId } : r)));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteStaff(s: StaffDirectoryRow) {
    if (busyId) return;
    if (!confirm(`「${s.displayName}」を削除します。ログインもできなくなります。よろしいですか？`)) return;
    setBusyId(s.id);
    try {
      await removeStaffMember(s.id);
      setStaff((rows) => rows.filter((r) => r.id !== s.id));
      if (selectedId === s.id) setSelectedId(null);
    } finally {
      setBusyId(null);
    }
  }

  const headerBtn: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    height: 34,
    padding: "0 12px",
    cursor: "pointer",
    fontSize: 12.5,
    color: "var(--color-accent)",
    background: "transparent",
    border: "1px solid var(--color-accent)",
    borderRadius: "var(--radius-md)",
  };

  const showListHeader = canBrowseStaff && !selectedEntry;

  const header = (
    <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "var(--space-6) var(--space-6) 0" }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>スタッフ</div>
      <div style={{ flex: 1 }} />
      {canAdmin && (
        <button onClick={() => setShowInvite(true)} style={headerBtn}>
          <UserPlus size={14} />
          スタッフを招待
        </button>
      )}
    </div>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0, maxWidth: 900, width: "100%", margin: "0 auto" }}>
      {showListHeader && header}

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: showListHeader ? "var(--space-4) var(--space-6) var(--space-6)" : 0 }}>
        {!canBrowseStaff ? (
          <StaffThreadPane staffProfileId={currentUserId} title="本部" currentUserId={currentUserId} orgId={orgId} />
        ) : selectedEntry ? (
          <StaffThreadPane
            staffProfileId={selectedEntry.id}
            title={selectedEntry.displayName}
            currentUserId={currentUserId}
            orgId={orgId}
            onBack={() => setSelectedId(null)}
            editable={
              canAdmin && selectedStaff
                ? {
                    displayName: selectedStaff.displayName,
                    role: selectedStaff.role,
                    departmentIds: selectedStaff.departmentIds,
                    departments,
                    canDelete: currentRole === "owner" && selectedStaff.role !== "owner",
                    onSaved: (patch) => setStaff((rows) => rows.map((r) => (r.id === selectedStaff.id ? { ...r, ...patch } : r))),
                    onRemoved: () => {
                      setStaff((rows) => rows.filter((r) => r.id !== selectedStaff.id));
                      setSelectedId(null);
                    },
                  }
                : undefined
            }
          />
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {canAdmin && archivedCount > 0 && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-neutral-400)" }}>
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                非表示のものも表示（{archivedCount}件）
              </label>
            )}
            {entries.length === 0 && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>まだスタッフがいません。右上の「スタッフを招待」から追加してください。</div>}
            {entries.map((e) => {
              const staffRow = !e.isSelf ? otherStaff.find((s) => s.id === e.id) : null;
              return (
                <div
                  key={e.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "12px 14px",
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-divider)",
                    borderRadius: "var(--radius-md)",
                    opacity: staffRow?.archived ? 0.55 : 1,
                  }}
                >
                  <button
                    onClick={() => setSelectedId(e.id)}
                    style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2, textAlign: "left", cursor: "pointer", color: "var(--color-text)", background: "transparent", border: "none", padding: 0 }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ fontSize: 14, fontWeight: e.unread ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.displayName}</div>
                      {e.unread && (
                        <span style={{ flex: "none", fontSize: 10, fontWeight: 700, color: "var(--color-bg)", background: "var(--color-accent-200)", borderRadius: "var(--radius-sm)", padding: "1.5px 6px" }}>
                          未読
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-neutral-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.lastMessagePreview ?? "まだやり取りがありません"}</div>
                  </button>
                  {canAdmin && staffRow && (
                    <RowKebabMenu
                      archived={staffRow.archived}
                      onToggleArchive={() => toggleArchiveStaff(staffRow)}
                      onDelete={staffRow.role !== "owner" ? () => handleDeleteStaff(staffRow) : undefined}
                      busy={busyId === staffRow.id}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showInvite && (
        <Modal onClose={() => setShowInvite(false)} maxWidth={560}>
          <InviteAdmin onClose={() => setShowInvite(false)} />
        </Modal>
      )}
    </div>
  );
}
