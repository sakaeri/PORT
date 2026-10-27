"use client";

import { useEffect, useState } from "react";
import { CircleNotch } from "@phosphor-icons/react";

// ページの中身（サーバーでの準備）が届くまでの間に出す画面。これが無いと、
// 不安定な回線では背景色だけの画面のまま止まって見えてしまう。
// しばらく待っても切り替わらないときだけ、再読み込みのボタンを出す。
export default function Loading() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 固定サイズの静的アセットのため plain img */}
          <img src="/logo.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
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
    </main>
  );
}
