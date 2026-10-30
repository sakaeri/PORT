"use client";

import { useEffect, useState } from "react";
import { CircleNotch } from "@phosphor-icons/react";

// タップ・クリックしてから次の画面のデータが揃うまでの間、何も表示が
// 変わらず「反応していない」ように見えて連打されてしまう問題への対応。
// Next.jsのApp Routerがページ遷移中に自動でこれを表示してくれる
// （サイドバーはそのまま操作可能で、中身だけこれに差し替わる）。
// 回線によっては途中で止まることがあるので（楽天モバイルの5Gなど）、
// しばらく進まなければやり直せるようにする。
export default function Loading() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center", padding: "var(--space-6)" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <CircleNotch size={22} style={{ color: "var(--color-accent)", animation: "vid-spin 0.7s linear infinite" }} />
        {slow && <div style={{ fontSize: 12.5, opacity: 0.85 }}>電波が弱いため読み込めませんでした。</div>}
        {slow && (
          <button
            onClick={() => window.location.reload()}
            style={{ height: 36, padding: "0 16px", cursor: "pointer", fontSize: 12.5, color: "var(--color-accent-100)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}
          >
            もう一度読み込む
          </button>
        )}
      </div>
    </div>
  );
}
