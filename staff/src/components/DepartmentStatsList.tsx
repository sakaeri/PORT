"use client";

import { useState } from "react";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { setDepartmentRoyaltyPct } from "@/app/actions";
import { errorMessage } from "@/lib/errors";
import MonthlyMenuBreakdown, { type MonthBreakdown } from "@/components/MonthlyMenuBreakdown";

export interface DepartmentStat {
  // 実際の窓口のidだけでなく、"unassigned"（窓口未設定の案件をまとめたもの、
  // オーナー視点のみ）も入る。ロイヤリティはそちらでは編集できない。
  id: string;
  name: string;
  royaltyPct: number | null;
  monthRatingAvg: number | null;
  monthRatingCount: number;
  monthCompleted: number;
  monthRevenue: number;
  months: MonthBreakdown[];
}

function yen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

const smallBtn: React.CSSProperties = {
  flex: "none",
  height: 30,
  padding: "0 10px",
  cursor: "pointer",
  fontSize: 12,
  whiteSpace: "nowrap",
  color: "var(--color-accent)",
  background: "transparent",
  border: "1px solid var(--color-accent)",
  borderRadius: "var(--radius-md)",
};

// 窓口（マネージャー）ごとの実績をカードで並べる。オーナーは全窓口＋
// 窓口未設定分、マネージャーは自分の窓口だけが渡ってくる想定。
export default function DepartmentStatsList({
  departments: initialDepartments,
  canEditRoyalty,
}: {
  departments: DepartmentStat[];
  canEditRoyalty: boolean;
}) {
  const [departments, setDepartments] = useState(initialDepartments);
  const [expandedId, setExpandedId] = useState<string | null>(departments.length === 1 ? departments[0].id : null);
  const [royaltyDraft, setRoyaltyDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function saveRoyalty(d: DepartmentStat) {
    if (savingId) return;
    const raw = royaltyDraft[d.id];
    const pct = raw === undefined || raw.trim() === "" ? null : Number(raw);
    if (pct != null && (Number.isNaN(pct) || pct < 0 || pct > 100)) {
      setError("0〜100の範囲で入力してください");
      return;
    }
    setError("");
    setSavingId(d.id);
    try {
      await setDepartmentRoyaltyPct(d.id, pct);
      setDepartments((rows) => rows.map((r) => (r.id === d.id ? { ...r, royaltyPct: pct } : r)));
    } catch (e) {
      setError(errorMessage(e, "変更できませんでした"));
    } finally {
      setSavingId(null);
    }
  }

  if (departments.length === 0) {
    return <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>まだ実績がありません。</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {departments.map((d) => {
        const expanded = expandedId === d.id;
        const isRealDepartment = d.id !== "unassigned";
        const royaltyAmount = d.royaltyPct != null ? Math.round((d.monthRevenue * d.royaltyPct) / 100) : null;
        return (
          <div key={d.id} style={{ borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)" }}>
            <button
              onClick={() => setExpandedId(expanded ? null : d.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer", background: "transparent", border: "none", textAlign: "left", color: "var(--color-text)" }}
            >
              {expanded ? <CaretDown size={14} color="var(--color-neutral-500)" /> : <CaretRight size={14} color="var(--color-neutral-500)" />}
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
              {d.monthRatingCount > 0 && (
                <span style={{ flex: "none", fontSize: 11.5, color: "var(--color-neutral-500)" }}>★{d.monthRatingAvg?.toFixed(1)}</span>
              )}
              <span style={{ flex: "none", fontSize: 12.5, fontFamily: "var(--font-heading)" }}>{yen(d.monthRevenue)}</span>
            </button>
            {expanded && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 14px 14px", borderTop: "1px solid var(--color-divider)", paddingTop: 12 }}>
                <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--color-neutral-500)" }}>
                  <span>今月の完了 {d.monthCompleted}件</span>
                  <span>今月の評価 {d.monthRatingCount > 0 ? `★${d.monthRatingAvg?.toFixed(1)}（${d.monthRatingCount}件）` : "まだありません"}</span>
                </div>

                {isRealDepartment && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>ロイヤリティ率</span>
                    {canEditRoyalty ? (
                      <>
                        <input
                          value={royaltyDraft[d.id] ?? (d.royaltyPct != null ? String(d.royaltyPct) : "")}
                          onChange={(e) => setRoyaltyDraft((draft) => ({ ...draft, [d.id]: e.target.value }))}
                          placeholder="未設定"
                          inputMode="numeric"
                          style={{ width: 56, height: 30, padding: "4px 8px", fontSize: 12.5, color: "var(--color-text)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none" }}
                        />
                        <span style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>%</span>
                        <button onClick={() => saveRoyalty(d)} disabled={savingId === d.id} style={smallBtn}>
                          保存
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: 12.5 }}>{d.royaltyPct != null ? `${d.royaltyPct}%` : "未設定"}</span>
                    )}
                    {royaltyAmount != null && <span style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>ロイヤリティ {yen(royaltyAmount)}</span>}
                  </div>
                )}

                <MonthlyMenuBreakdown months={d.months} />
              </div>
            )}
          </div>
        );
      })}
      {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
    </div>
  );
}
