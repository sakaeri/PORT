"use client";

import { useEffect, useRef, useState } from "react";
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

const MENU_WIDTH = 150;

// 一覧行の「非表示にする／一覧に戻す」「削除」をまとめる共通の「…」メニュー。
// 依頼主・案件トーク・スタッフの3つの一覧で同じ見た目・操作感にするために共通化する。
// 一覧の一番下の行で開くと画面の外にはみ出してしまう（スクロールしても届かない）
// ため、position: fixed でボタンの実際の画面位置から出し、下に収まらなければ
// 上に開く。
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
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function close() {
      setOpen(false);
    }
    // スクロール・リサイズが起きたら、ボタンから浮いた位置のままにならないよう閉じる
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (!onToggleArchive && !onDelete) return null;

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const itemCount = (onToggleArchive ? 1 : 0) + (onDelete ? 1 : 0);
      const menuHeight = itemCount * 32 + 12;
      const openUpward = window.innerHeight - rect.bottom < menuHeight + 8;
      setPos({
        left: Math.max(8, rect.right - MENU_WIDTH),
        ...(openUpward ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      });
    }
    setOpen((v) => !v);
  }

  return (
    <div style={{ position: "relative", flex: "none" }}>
      <button ref={btnRef} onClick={handleToggle} disabled={busy} aria-label="操作メニュー" style={kebabBtn}>
        <DotsThreeVertical size={15} />
      </button>
      {open && pos && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
          <div
            style={{
              position: "fixed",
              top: pos.top,
              bottom: pos.bottom,
              left: pos.left,
              zIndex: 60,
              width: MENU_WIDTH,
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
