"use client";

import { useState } from "react";
import { CaretDown } from "@phosphor-icons/react";

// 依頼主一覧・案件トーク・スタッフ一覧で共通の「窓口で絞り込む」ドロップダウン。
export default function DepartmentFilterDropdown({
  options,
  value,
  onChange,
}: {
  options: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = options.find((o) => o.id === value)?.name ?? "すべて";

  return (
    <div style={{ position: "relative", alignSelf: "flex-start" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          height: 30,
          padding: "0 12px",
          cursor: "pointer",
          fontSize: 12.5,
          color: "var(--color-text)",
          background: "var(--color-surface)",
          border: "1px solid var(--color-divider)",
          borderRadius: "var(--radius-md)",
        }}
      >
        窓口：{label}
        <CaretDown size={12} color="var(--color-neutral-500)" />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 4,
              zIndex: 60,
              minWidth: 180,
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
            {options.map((o) => (
              <button
                key={o.id}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: 32,
                  padding: "0 10px",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 12.5,
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  color: o.id === value ? "var(--color-accent)" : "var(--color-text)",
                  background: o.id === value ? "color-mix(in srgb, var(--color-accent) 14%, transparent)" : "transparent",
                }}
              >
                {o.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
