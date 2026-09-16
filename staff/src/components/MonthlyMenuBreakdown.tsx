"use client";

import { useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

export interface MonthBreakdown {
  key: string;
  label: string;
  items: { label: string; amount: number }[];
}

function yen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

const navBtn: React.CSSProperties = {
  flex: "none",
  width: 30,
  height: 30,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  color: "var(--color-neutral-400)",
  background: "transparent",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
};

export default function MonthlyMenuBreakdown({ months }: { months: MonthBreakdown[] }) {
  const [index, setIndex] = useState(months.length - 1);
  const month = months[index];
  const total = month.items.reduce((s, it) => s + it.amount, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} aria-label="前の月" style={navBtn}>
          <CaretLeft size={14} />
        </button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 14, fontFamily: "var(--font-heading)" }}>{month.label}</div>
        <button onClick={() => setIndex((i) => Math.min(months.length - 1, i + 1))} disabled={index === months.length - 1} aria-label="次の月" style={navBtn}>
          <CaretRight size={14} />
        </button>
      </div>

      {month.items.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>この月の入金確認実績はありません。</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {month.items.map((it, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)" }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</div>
              <div style={{ flex: "none", fontSize: 13, fontFamily: "var(--font-heading)" }}>{yen(it.amount)}</div>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px", fontSize: 12, color: "var(--color-neutral-500)" }}>
            <div style={{ flex: 1 }}>合計</div>
            <div style={{ flex: "none" }}>{yen(total)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
