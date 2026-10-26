"use client";

import { useEffect, useState } from "react";
import InfoTooltip from "@/components/chat/InfoTooltip";

// 立替の見積もりの有効期限（requests.quote_expires_at）までの残り時間。
// サーバーで描いた時刻と食い違わないよう、時計はブラウザで動き出してから使う。
export function useQuoteExpiry(expiresAt: string | null): { expired: boolean; remaining: string | null } {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [expiresAt]);

  if (!expiresAt || now == null) return { expired: false, remaining: null };
  const left = new Date(expiresAt).getTime() - now;
  if (left <= 0) return { expired: true, remaining: null };
  const totalSec = Math.ceil(left / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  // 1時間以上ある間は「2時間15分」、それより短くなったら分:秒で数える。
  if (h > 0) return { expired: false, remaining: `${h}時間${m}分` };
  return { expired: false, remaining: `${m}:${String(s).padStart(2, "0")}` };
}

// 確定ボタンのすぐ上に出す一行。期限切れなら確定できない理由を出す。
export function QuoteExpiryLine({ expired, remaining }: { expired: boolean; remaining: string | null }) {
  if (expired) {
    return <div style={{ color: "var(--color-accent-200)" }}>有効期限が切れました。担当者に再見積もりをご依頼ください。</div>;
  }
  if (!remaining) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span>
        有効期限：あと<span style={{ fontVariantNumeric: "tabular-nums", color: "var(--color-accent-300)" }}>{remaining}</span>
      </span>
      <InfoTooltip text="予約サイトの料金が変わる可能性があるため、期限内にご確定ください。" />
    </div>
  );
}

// 一覧の中（map の中）でフックを使えない場所向けの包み。
export function WithQuoteExpiry({ expiresAt, children }: { expiresAt: string | null; children: (state: { expired: boolean; remaining: string | null }) => React.ReactNode }) {
  return <>{children(useQuoteExpiry(expiresAt))}</>;
}
