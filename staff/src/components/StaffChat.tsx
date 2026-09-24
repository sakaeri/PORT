"use client";

import { useState } from "react";
import { GearSix } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import StaffThreadPane from "@/components/StaffThreadPane";
import StaffAdmin, { type Department, type MenuOption, type StaffRow } from "@/components/StaffAdmin";
import type { StaffRole } from "@/lib/supabase/types";

interface StaffListRow {
  id: string;
  displayName: string;
}

export default function StaffChat({
  currentUserId,
  currentRole,
  orgId,
  canManage,
  staffList,
  departments,
  staffRows,
  menus,
}: {
  currentUserId: string;
  currentRole: StaffRole | "reception";
  orgId: string;
  canManage: boolean;
  staffList: StaffListRow[];
  departments: Department[];
  staffRows: StaffRow[];
  menus: MenuOption[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(canManage ? null : currentUserId);
  const [showAdmin, setShowAdmin] = useState(false);

  const header = (
    <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "var(--space-6) var(--space-6) 0" }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>スタッフ</div>
      <div style={{ flex: 1 }} />
      {canManage && (
        <button
          onClick={() => setShowAdmin(true)}
          style={{
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
          }}
        >
          <GearSix size={14} />
          窓口・スタッフ管理
        </button>
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
        ) : selectedId ? (
          <div style={{ flex: 1, minHeight: 0, border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}>
            <StaffThreadPane
              staffProfileId={selectedId}
              title={staffList.find((s) => s.id === selectedId)?.displayName ?? "スタッフ"}
              currentUserId={currentUserId}
              orgId={orgId}
              onBack={() => setSelectedId(null)}
            />
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {staffList.length === 0 && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>ほかにスタッフがいません。</div>}
            {staffList.map((s) => (
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

      {showAdmin && (
        <div
          onClick={() => setShowAdmin(false)}
          style={{ position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center", padding: 20, background: "color-mix(in srgb, var(--color-bg) 72%, transparent)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(820px, 100%)", maxHeight: "88vh", overflowY: "auto", borderRadius: "var(--radius-lg)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", boxShadow: "var(--shadow-lg)" }}
          >
            <StaffAdmin currentUserId={currentUserId} currentRole={currentRole} departments={departments} staff={staffRows} menus={menus} onClose={() => setShowAdmin(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
