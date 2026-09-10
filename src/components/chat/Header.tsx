"use client";

import { MagnifyingGlass, ListChecks, ClipboardText, UserCircle, Headset } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";

interface Props {
  brandName: string;
  activeCount: number;
  reportsCount: number;
  searchQuery: string;
  searchResultCount: number | null;
  onSearchChange: (v: string) => void;
  onOpenProgress: () => void;
  onOpenReports: () => void;
  onOpenMyPage: () => void;
}

const iconBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  cursor: "pointer",
  fontFamily: "var(--font-heading)",
  fontSize: 12.5,
  color: "var(--color-text)",
  background: "transparent",
  border: "1px solid var(--color-divider)",
  padding: "7px 12px",
  borderRadius: "var(--radius-md)",
  whiteSpace: "nowrap",
  flex: "none",
};

export default function Header({
  brandName,
  activeCount,
  reportsCount,
  searchQuery,
  searchResultCount,
  onSearchChange,
  onOpenProgress,
  onOpenReports,
  onOpenMyPage,
}: Props) {
  return (
    <div
      className="vid-header"
      style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--color-divider)",
        flex: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
          }}
        >
          <Headset size={17} color="var(--color-accent)" />
        </div>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 18, whiteSpace: "nowrap" }}>
          {brandName}
        </div>
      </div>

      <div className="vid-header-search" style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 170px", minWidth: 130 }}>
        <MagnifyingGlass size={14} color="var(--color-neutral-600)" style={{ flex: "none" }} />
        <input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="トーク内を検索…"
          className="vid-input"
          style={{
            flex: 1,
            minWidth: 0,
            height: 32,
            padding: "6px 10px",
            fontSize: 13,
            color: "var(--color-text)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-divider)",
            borderRadius: "var(--radius-md)",
            outline: "none",
          }}
        />
        <span style={{ fontSize: 11, color: "var(--color-neutral-600)", whiteSpace: "nowrap", flex: "none" }}>
          {searchQuery.trim() ? `${searchResultCount ?? 0}件` : ""}
        </span>
      </div>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
        <button onClick={onOpenProgress} title="進捗状況" style={iconBtn}>
          <ListChecks size={15} />
          <span className="vid-header-label">進捗状況</span>
          {activeCount ? `（${activeCount}）` : ""}
        </button>
        <button onClick={onOpenReports} title="報告書一覧" style={iconBtn}>
          <ClipboardText size={15} />
          <span className="vid-header-label">報告書一覧</span>
          {reportsCount ? `（${reportsCount}）` : ""}
        </button>
        <button
          onClick={onOpenMyPage}
          aria-label="マイページ"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "var(--color-text)",
            background: "transparent",
            border: "1px solid var(--color-divider)",
            width: 36,
            height: 36,
            borderRadius: "var(--radius-md)",
            flex: "none",
          }}
        >
          <UserCircle size={16} />
        </button>
      </div>
    </div>
  );
}
