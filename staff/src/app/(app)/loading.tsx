"use client";

import { CircleNotch } from "@phosphor-icons/react";

// タップ・クリックしてから次の画面のデータが揃うまでの間、何も表示が
// 変わらず「反応していない」ように見えて連打されてしまう問題への対応。
// Next.jsのApp Routerがページ遷移中に自動でこれを表示してくれる
// （サイドバーはそのまま操作可能で、中身だけこれに差し替わる）。
export default function Loading() {
  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center", padding: "var(--space-6)" }}>
      <CircleNotch size={22} style={{ color: "var(--color-accent)", animation: "vid-spin 0.7s linear infinite" }} />
    </div>
  );
}
