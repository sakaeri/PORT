"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { CircleNotch } from "@phosphor-icons/react";
import { completeAnonymousEntry } from "@/app/actions";
import { errorMessage } from "@/lib/errors";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => string;
    };
  }
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// proxy.ts はもう匿名ログインを自動でしない。かわりに初回訪問だけこの画面を
// 一瞬はさみ、見えない（invisible）Cloudflare Turnstileチェックを裏で通して
// から匿名セッションを開始する。Turnstile側のサイトキーを「Invisible」
// モードで作ってある前提で、正常な訪問者には基本的にスピナーが一瞬出る
// だけで終わる。NEXT_PUBLIC_TURNSTILE_SITE_KEY が未設定の間はチェック自体を
// スキップしてそのまま進む（他のTurnstile導入箇所と同じ段階的導入のパターン）。
export default function VerifyGate() {
  const router = useRouter();
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const proceed = useCallback(
    async (token: string) => {
      if (startedRef.current) return;
      startedRef.current = true;
      try {
        await completeAnonymousEntry(token);
        router.refresh();
      } catch (e) {
        setError(errorMessage(e, "読み込みに失敗しました。しばらくして再度お試しください。"));
        startedRef.current = false;
      }
    },
    [router],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Turnstile未導入の間だけ、外部チェックなしでそのまま匿名セッションを開始する
    if (!TURNSTILE_SITE_KEY) void proceed("");
  }, [proceed]);

  function handleTurnstileLoaded() {
    if (!TURNSTILE_SITE_KEY || !containerRef.current || !window.turnstile) return;
    window.turnstile.render(containerRef.current, { sitekey: TURNSTILE_SITE_KEY, callback: proceed });
  }

  return (
    <main style={{ height: "100vh", display: "grid", placeItems: "center", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)", padding: 24 }}>
      {TURNSTILE_SITE_KEY && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" onLoad={handleTurnstileLoaded} />
          <div ref={containerRef} />
        </>
      )}
      {error ? (
        <div style={{ maxWidth: 320, fontSize: 13.5, lineHeight: 1.7, textAlign: "center", opacity: 0.85 }}>{error}</div>
      ) : (
        <CircleNotch size={22} style={{ color: "var(--color-accent)", animation: "vid-spin 0.7s linear infinite" }} />
      )}
    </main>
  );
}
