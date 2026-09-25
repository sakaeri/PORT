"use client";

import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/lib/useIsMobile";

export default function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [mobileTop, setMobileTop] = useState(0);

  useEffect(() => {
    if (open && isMobile && btnRef.current) {
      // position:fixed なので、開いた時点のボタン位置（ビューポート基準）を測っておく。
      setMobileTop(btnRef.current.getBoundingClientRect().bottom + 6);
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
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  zIndex: 20,
                  width: "max-content",
                  maxWidth: 520,
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
