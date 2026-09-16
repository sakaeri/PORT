"use client";

import { useState } from "react";
import Link from "next/link";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

export interface MonthRow {
  requestId: string;
  customerName: string;
  title: string;
  amount: number;
  status: "paid" | "pending";
}

export interface MonthBreakdown {
  key: string;
  label: string;
  rows: MonthRow[];
}

function yen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

const navBtn: React.CSSProperties = {
  flex: "none",
  width: 26,
  height: 26,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  color: "var(--color-neutral-400)",
  background: "transparent",
  border: "none",
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 14px",
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-divider)",
  textDecoration: "none",
  color: "inherit",
};

function Row({ r }: { r: MonthRow }) {
  return (
    <Link href={`/cases/${r.requestId}`} style={row}>
      <div style={{ flex: "none", fontSize: 12.5, color: "var(--color-neutral-500)", maxWidth: 88, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.customerName}</div>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
      {r.status === "pending" && (
        <span style={{ flex: "none", fontSize: 10, padding: "2px 8px", borderRadius: 6, border: "1px solid var(--color-divider)", color: "var(--color-neutral-400)" }}>入金待ち</span>
      )}
      <div style={{ flex: "none", fontSize: 13, fontFamily: "var(--font-heading)" }}>{yen(r.amount)}</div>
    </Link>
  );
}

export default function MonthlyMenuBreakdown({ months }: { months: MonthBreakdown[] }) {
  const [index, setIndex] = useState(months.length - 1);
  const month = months[index];
  const pending = month.rows.filter((r) => r.status === "pending");
  const paid = month.rows.filter((r) => r.status === "paid");
  const paidTotal = paid.reduce((s, r) => s + r.amount, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 2 }}>
        {index > 0 && (
          <button onClick={() => setIndex((i) => i - 1)} aria-label="前の月" style={navBtn}>
            <CaretLeft size={14} />
          </button>
        )}
        <div style={{ fontSize: 14, fontFamily: "var(--font-heading)" }}>{month.label}</div>
        {index < months.length - 1 && (
          <button onClick={() => setIndex((i) => i + 1)} aria-label="次の月" style={navBtn}>
            <CaretRight size={14} />
          </button>
        )}
      </div>

      {month.rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>この月の入金確認実績はありません。</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {pending.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>入金待ち</div>
              {pending.map((r) => (
                <Row key={r.requestId} r={r} />
              ))}
            </div>
          )}
          {paid.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {pending.length > 0 && <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>入金済み</div>}
              {paid.map((r) => (
                <Row key={r.requestId} r={r} />
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px", fontSize: 12, color: "var(--color-neutral-500)" }}>
                <div style={{ flex: 1 }}>合計</div>
                <div style={{ flex: "none" }}>{yen(paidTotal)}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
