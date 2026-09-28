"use client";

import { useState } from "react";
import { DotsThreeVertical, Archive, ArrowCounterClockwise, Trash } from "@phosphor-icons/react";

const kebabBtn: React.CSSProperties = {
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

const menuItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  height: 32,
  padding: "0 10px",
  cursor: "pointer",
  textAlign: "left",
  fontSize: 12.5,
  color: "var(--color-text)",
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-sm)",
  whiteSpace: "nowrap",
};

// 一覧行の「非表示にする／一覧に戻す」「削除」をまとめる共通の「…」メニュー。
// 依頼主・案件トーク・スタッフの3つの一覧で同じ見た目・操作感にするために共通化する。
export default function RowKebabMenu({
  archived,
  onToggleArchive,
  onDelete,
  busy,
  archiveLabel = "非表示にする",
  unarchiveLabel = "一覧に戻す",
  deleteLabel = "削除",
}: {
  archived?: boolean;
  onToggleArchive?: () => void;
  onDelete?: () => void;
  busy?: boolean;
  archiveLabel?: string;
  unarchiveLabel?: string;
  deleteLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!onToggleArchive && !onDelete) return null;

  return (
    <div style={{ position: "relative", flex: "none" }}>
      <button onClick={() => setOpen((v) => !v)} disabled={busy} aria-label="操作メニュー" style={kebabBtn}>
        <DotsThreeVertical size={15} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: 4,
              zIndex: 60,
              minWidth: 150,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              padding: 6,
              borderRadius: "var(--radius-md)",
              background: "var(--color-surface)",
              border: "1px solid var(--color-divider)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            {onToggleArchive && (
              <button
                onClick={() => {
                  setOpen(false);
                  onToggleArchive();
                }}
                style={menuItem}
              >
                {archived ? <ArrowCounterClockwise size={13} /> : <Archive size={13} />}
                {archived ? unarchiveLabel : archiveLabel}
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                style={{ ...menuItem, color: "var(--color-accent-200)" }}
              >
                <Trash size={13} />
                {deleteLabel}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
