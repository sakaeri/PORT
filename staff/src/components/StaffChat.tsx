"use client";

import { useState } from "react";
import { Buildings, UserPlus } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import StaffThreadPane from "@/components/StaffThreadPane";
import { DepartmentAdmin, InviteAdmin, type Department, type MenuOption, type PendingInvite } from "@/components/StaffAdmin";
import type { StaffRole } from "@/lib/supabase/types";

function Modal({ children, onClose, maxWidth }: { children: React.ReactNode; onClose: () => void; maxWidth: number }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center", padding: 20, background: "color-mix(in srgb, var(--color-bg) 72%, transparent)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: `min(${maxWidth}px, 100%)`, maxHeight: "88vh", overflowY: "auto", borderRadius: "var(--radius-lg)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", boxShadow: "var(--shadow-lg)" }}
      >
        {children}
      </div>
    </div>
  );
}

export interface StaffDirectoryRow {
  id: string;
  displayName: string;
  role: StaffRole;
  departmentIds: string[];
}

export default function StaffChat({
  currentUserId,
  currentRole,
  orgId,
  canManage,
  staff: initialStaff,
  departments,
  menus,
  pendingInvites,
}: {
  currentUserId: string;
  currentRole: StaffRole | "reception";
  orgId: string;
  canManage: boolean;
  staff: StaffDirectoryRow[];
  departments: Department[];
  menus: MenuOption[];
  pendingInvites: PendingInvite[];
}) {
  const [staff, setStaff] = useState(initialStaff);
  const [selectedId, setSelectedId] = useState<string | null>(canManage ? null : currentUserId);
  const [showDepartments, setShowDepartments] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  const otherStaff = staff.filter((s) => s.id !== currentUserId);
  const selected = selectedId ? staff.find((s) => s.id === selectedId) : null;

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

  const header = (
    <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "var(--space-6) var(--space-6) 0" }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>スタッフ</div>
      <div style={{ flex: 1 }} />
      {canManage && (
        <>
          <button onClick={() => setShowDepartments(true)} style={headerBtn}>
            <Buildings size={14} />
            窓口管理
          </button>
          <button onClick={() => setShowInvite(true)} style={headerBtn}>
            <UserPlus size={14} />
            スタッフを招待
          </button>
        </>
      )}
    </div>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {header}

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "var(--space-4) var(--space-6) var(--space-6)" }}>
        {!canManage ? (
          <div style={{ flex: 1, minHeight: 0, border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}>
            <StaffThreadPane staffProfileId={currentUserId} title="本部" currentUserId={currentUserId} orgId={orgId} />
          </div>
        ) : selected ? (
          <div style={{ flex: 1, minHeight: 0, border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}>
            <StaffThreadPane
              staffProfileId={selected.id}
              title={selected.displayName}
              currentUserId={currentUserId}
              orgId={orgId}
              onBack={() => setSelectedId(null)}
              editable={{
                role: selected.role,
                departmentIds: selected.departmentIds,
                departments,
                canDelete: currentRole === "owner" && selected.role !== "owner",
                onSaved: (patch) => setStaff((rows) => rows.map((r) => (r.id === selected.id ? { ...r, ...patch } : r))),
                onRemoved: () => {
                  setStaff((rows) => rows.filter((r) => r.id !== selected.id));
                  setSelectedId(null);
                },
              }}
            />
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {otherStaff.length === 0 && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>ほかにスタッフがいません。</div>}
            {otherStaff.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  textAlign: "left",
                  padding: "12px 14px",
                  cursor: "pointer",
                  fontSize: 13.5,
                  color: "var(--color-text)",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-divider)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                {s.displayName}
              </button>
            ))}
          </div>
        )}
      </div>

      {showDepartments && (
        <Modal onClose={() => setShowDepartments(false)} maxWidth={640}>
          <DepartmentAdmin currentRole={currentRole} departments={departments} menus={menus} onClose={() => setShowDepartments(false)} />
        </Modal>
      )}
      {showInvite && (
        <Modal onClose={() => setShowInvite(false)} maxWidth={560}>
          <InviteAdmin pendingInvites={pendingInvites} onClose={() => setShowInvite(false)} />
        </Modal>
      )}
    </div>
  );
}
