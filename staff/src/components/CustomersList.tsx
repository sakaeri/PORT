"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowSquareOut, Buildings } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { archiveThread, unarchiveThread, deleteCustomer } from "@/app/actions";
import type { Department } from "@/components/StaffAdmin";
import RowKebabMenu from "@/components/RowKebabMenu";
import Avatar, { avatarInitial } from "@/components/Avatar";
import DepartmentFilterDropdown from "@/components/DepartmentFilterDropdown";

interface CustomerRow {
  id: string;
  name: string;
  memberNo: string | null;
  avatarUrl: string | null;
  active: boolean;
  convertedOrg: { displayName: string; slug: string | null } | null;
  thread: { id: string; archived: boolean } | null;
  departmentId: string | null;
  lastMessagePreview: string | null;
  unread: boolean;
  requestCount: number;
  lifetimeTotal: number;
  activeCase: { title: string; phaseLabel: string } | null;
}

const yen = new Intl.NumberFormat("ja-JP");

export default function CustomersList({
  rows: initialRows,
  isHq,
  orgId,
  departments: initialDepartments,
  orgDisplayName,
}: {
  rows: CustomerRow[];
  isHq: boolean;
  orgId: string;
  departments: Department[];
  // 窓口（秘書）未設定の分は、事業所全体の担当としてこの名前でくくる。
  orgDisplayName: string;
}) {
  const router = useRouter();
  const [departments, setDepartments] = useState(initialDepartments);
  const departmentById = new Map(departments.map((d) => [d.id, d.name]));
  const [rows, setRows] = useState(initialRows);
  const [showArchived, setShowArchived] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const visible = rows
    .filter((c) => c.active || showArchived)
    .filter((c) => departmentFilter === "all" || (departmentFilter === "none" ? c.departmentId === null : c.departmentId === departmentFilter));
  const archivedCount = rows.filter((c) => !c.active).length;
  const filterOptions = [{ id: "all", name: "すべて" }, ...departments, { id: "none", name: orgDisplayName }];

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from a server-refetched prop (router.refresh()), not state derived from other client state
    setDepartments(initialDepartments);
  }, [initialDepartments]);

  // サーバーから渡された最新の行を反映する（下のポーリング/リアルタイムが
  // router.refresh() でこのページを再取得するたびに initialRows が更新される）。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from a server-refetched prop (router.refresh()), not state derived from other client state
    setRows(initialRows);
  }, [initialRows]);

  // 一覧の未読マーク・直近メッセージはこのコンポーネント自身では再取得せず、
  // ページ全体(customers/page.tsx)を router.refresh() で再取得させることで
  // 既存のサーバー側クエリをそのまま使い回す。
  useEffect(() => {
    const supabase = createClient(orgId);
    const channel = supabase
      .channel(`customers-list-${orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "threads" }, () => router.refresh())
      .subscribe();
    const interval = setInterval(() => router.refresh(), 4000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [orgId, router]);

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
      <DepartmentFilterDropdown options={filterOptions} value={departmentFilter} onChange={setDepartmentFilter} />
      {archivedCount > 0 && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-neutral-400)" }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          非表示のものも表示（{archivedCount}件）
        </label>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visible.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", opacity: c.active ? 1 : 0.55 }}>
            <Avatar url={c.avatarUrl} initial={avatarInitial(c.name)} size={40} />
            <Link href={`/customers/${c.id}`} style={{ flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: c.unread ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                {c.departmentId && departmentById.get(c.departmentId) && (
                  <span style={{ flex: "none", fontSize: 10, color: "var(--color-neutral-500)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-sm)", padding: "1px 6px" }}>
                    {departmentById.get(c.departmentId)}
                  </span>
                )}
                {c.unread && (
                  <span style={{ flex: "none", fontSize: 10, fontWeight: 700, color: "var(--color-bg)", background: "var(--color-accent-200)", borderRadius: "var(--radius-sm)", padding: "1.5px 6px" }}>
                    未読
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 11, color: "var(--color-neutral-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.lastMessagePreview ?? "まだやり取りがありません"}</div>
                {c.requestCount > 0 && (
                  <div style={{ flex: "none", fontSize: 11, color: "var(--color-neutral-500)" }}>
                    依頼{c.requestCount}件・累計¥{yen.format(c.lifetimeTotal)}
                  </div>
                )}
              </div>
              {c.activeCase && (
                <div style={{ marginTop: 5 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      maxWidth: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: 10.5,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 999,
                      color: "var(--color-accent-100)",
                      background: "var(--color-accent-900)",
                      border: "1px solid var(--color-accent)",
                    }}
                  >
                    {c.activeCase.phaseLabel}：{c.activeCase.title}
                  </span>
                </div>
              )}
            </Link>
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
            <RowKebabMenu
              archived={c.thread?.archived}
              onToggleArchive={c.thread ? () => toggleArchive(c) : undefined}
              onDelete={() => handleDelete(c)}
              busy={busyId === c.id}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
