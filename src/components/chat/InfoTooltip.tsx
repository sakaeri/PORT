"use client";

import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/lib/useIsMobile";

export default function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [mobileTop, setMobileTop] = useState(0);
  const [desktopPos, setDesktopPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    // モーダル（overflow:auto）の中で使われることがあるため、position:absolute だと
    // モーダルのスクロール領域に収まらず切れたり余計なスクロールバーが出てしまう。
    // position:fixed にして、開いた時点のボタン位置（ビューポート基準）から計算する。
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    if (isMobile) {
      setMobileTop(rect.bottom + 6);
    } else {
      const maxWidth = 320;
      const left = Math.min(rect.left, window.innerWidth - maxWidth - 16);
      setDesktopPos({ top: rect.bottom + 6, left: Math.max(16, left) });
    }
  }, [open, isMobile]);

  return (
    <span style={{ position: "relative", display: "inline-flex", flex: "none", alignSelf: "flex-start" }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        aria-label="説明を表示"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 13,
          height: 13,
          padding: 0,
          cursor: "pointer",
          fontSize: 9,
          lineHeight: 1,
          color: "var(--color-neutral-500)",
          background: "transparent",
          border: "1px solid var(--color-neutral-500)",
          borderRadius: "50%",
        }}
      >
        i
      </button>
      {open && (
        <div
          role="tooltip"
          style={
            isMobile
              ? {
                  position: "fixed",
                  top: mobileTop,
                  left: 16,
                  right: 16,
                  zIndex: 30,
                  padding: "10px 12px",
                  fontSize: 11.5,
                  lineHeight: 1.6,
                  color: "var(--color-text)",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-divider)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "var(--shadow-md)",
                }
              : {
                  position: "fixed",
                  top: desktopPos.top,
                  left: desktopPos.left,
                  zIndex: 30,
                  width: "max-content",
                  maxWidth: 320,
                  padding: "10px 12px",
                  fontSize: 11.5,
                  lineHeight: 1.6,
                  color: "var(--color-text)",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-divider)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "var(--shadow-md)",
                }
          }
        >
          {text}
        </div>
      )}
    </span>
  );
}
