"use client";

import { Printer } from "@phosphor-icons/react";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print"
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
      <Printer size={14} />
      印刷・PDF保存
    </button>
  );
}
