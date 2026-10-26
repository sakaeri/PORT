"use client";

import { useEffect, useState } from "react";

const QUERY = "(max-width: 720px)";

// サーバーとクライアントの初回描画を必ず一致させるため、常に false から始めて
// マウント後（DOMのmatchMediaが使える段階）に実際の値へ同期する。
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from matchMedia (external browser state), not derived from props/state
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isMobile;
}
